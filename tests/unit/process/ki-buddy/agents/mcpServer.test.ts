import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentsMcpServer } from '@/process/ki-buddy/agents/mcpServer';
import { AgentsMcpError } from '@/process/ki-buddy/agents/errors';

class LinkedTransport implements Transport {
  peer: LinkedTransport | null = null;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    queueMicrotask(() => this.peer?.onmessage?.(message));
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

function linkedTransports(): [LinkedTransport, LinkedTransport] {
  const left = new LinkedTransport();
  const right = new LinkedTransport();
  left.peer = right;
  right.peer = left;
  return [left, right];
}

const clients: Client[] = [];
const identity = { deploymentOrigin: 'https://agents.example.test', sessionEpoch: 1, userId: 'user-1' };

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connect(
  list: (options?: { forceRefresh?: boolean }) => Promise<unknown>,
  describeAgent: (agentId: string) => Promise<unknown> = async () => ({}),
  invoke: (
    grant: { agentId: string; identity: typeof identity },
    inputs: Record<string, boolean | number | string>
  ) => Promise<unknown> = async () => ({})
) {
  const server = createAgentsMcpServer({
    describe: async (agentId: string) => {
      const description = await describeAgent(agentId);
      return {
        description,
        grant: { agentId: (description as { agentId: string }).agentId, identity },
      };
    },
    invoke,
    list,
  } as never);
  const client = new Client({ name: 'agents-mcp-test', version: '1.0.0' });
  const [serverTransport, clientTransport] = linkedTransports();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

describe('createAgentsMcpServer', () => {
  it('publishes read-only tools for complete inventory and exact schema description', async () => {
    const client = await connect(async () => ({ total: 0, agents: [] }));

    const result = await client.listTools();

    expect(result.tools.map(({ name }) => name)).toEqual(['agents_list', 'agents_describe', 'agents_invoke']);
    expect(result.tools[0]).toMatchObject({
      name: 'agents_list',
      annotations: { readOnlyHint: true },
    });
    expect(result.tools[1]).toMatchObject({
      name: 'agents_describe',
      annotations: { readOnlyHint: true },
      inputSchema: {
        required: ['agentId'],
        properties: { agentId: { type: 'string' } },
      },
    });
  });

  it('direct invokes only the candidate established by the latest exact describe', async () => {
    const description = {
      agentId: 'agent-1',
      title: 'Agent 1',
      description: '',
      agentType: 'workflow',
      inputSchema: [{ name: 'query', description: 'Query', type: 'text', required: true }],
      outputSchema: [],
    };
    const invoke = vi.fn().mockResolvedValue({
      agentId: 'agent-1',
      taskId: 'task-1',
      requestId: 'request-1',
      text: 'Done.',
    });
    const client = await connect(
      async () => ({ total: 0, agents: [] }),
      async () => description,
      invoke
    );

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });
    const result = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-1', inputs: { query: 'Summarize this.' } },
    });

    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({ agentId: 'agent-1', taskId: 'task-1', requestId: 'request-1', text: 'Done.' }),
      },
    ]);
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith({ agentId: 'agent-1', identity }, { query: 'Summarize this.' });
  });

  it('consumes the authorization when invoke rewrites the described agentId', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ agentId: 'agent-1', taskId: 'task-1', requestId: 'request-1', text: '' });
    const client = await connect(
      async () => ({ total: 0, agents: [] }),
      async (agentId) => ({ agentId }),
      invoke
    );

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-selected' } });
    const rewritten = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-rewritten', inputs: {} },
    });
    const retry = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-selected', inputs: {} },
    });

    expect(rewritten).toMatchObject({
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: { code: 'invalid_input', message: 'Agent inputs do not match the current scalar schema' },
          }),
        },
      ],
    });
    expect(retry.isError).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invalidates an earlier authorization when the next describe fails', async () => {
    const describeAgent = vi
      .fn()
      .mockResolvedValueOnce({ agentId: 'agent-1' })
      .mockRejectedValueOnce(new AgentsMcpError('not_found', 'private catalog detail'));
    const invoke = vi
      .fn()
      .mockResolvedValue({ agentId: 'agent-1', taskId: 'task-1', requestId: 'request-1', text: '' });
    const client = await connect(async () => ({ total: 0, agents: [] }), describeAgent, invoke);

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });
    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'missing-agent' } });
    const result = await client.callTool({ name: 'agents_invoke', arguments: { agentId: 'agent-1', inputs: {} } });

    expect(result.isError).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('consumes one described selection before dispatch so one selection cannot invoke twice', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ agentId: 'agent-1', taskId: 'task-1', requestId: 'request-1', text: '' });
    const client = await connect(
      async () => ({ total: 0, agents: [] }),
      async (agentId) => ({ agentId }),
      invoke
    );

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });
    await client.callTool({ name: 'agents_invoke', arguments: { agentId: 'agent-1', inputs: {} } });
    const duplicate = await client.callTool({ name: 'agents_invoke', arguments: { agentId: 'agent-1', inputs: {} } });

    expect(duplicate.isError).toBe(true);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('does not restore an authorization after the invoke client fails', async () => {
    const invoke = vi.fn().mockRejectedValue(new AgentsMcpError('server', 'private invoke detail'));
    const client = await connect(
      async () => ({ total: 0, agents: [] }),
      async (agentId) => ({ agentId }),
      invoke
    );

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });
    await client.callTool({ name: 'agents_invoke', arguments: { agentId: 'agent-1', inputs: {} } });
    const retry = await client.callTool({ name: 'agents_invoke', arguments: { agentId: 'agent-1', inputs: {} } });

    expect(retry.isError).toBe(true);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('returns safe invoke correlations when a dispatched Gateway task fails', async () => {
    const failure = new AgentsMcpError('invoke_failed', 'private invoke detail', {
      agentId: 'agent-1',
      taskId: 'task-1',
      requestId: 'request-1',
    });
    const client = await connect(
      async () => ({ total: 0, agents: [] }),
      async (agentId) => ({ agentId }),
      vi.fn().mockRejectedValue(failure)
    );

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });
    const result = await client.callTool({ name: 'agents_invoke', arguments: { agentId: 'agent-1', inputs: {} } });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            agentId: 'agent-1',
            taskId: 'task-1',
            requestId: 'request-1',
            error: { code: 'invoke_failed', message: 'Agent execution failed' },
          }),
        },
      ],
    });
  });

  it('allows a new successful describe to authorize another invoke', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ agentId: 'agent-1', taskId: 'task-1', requestId: 'request-1', text: '' });
    const client = await connect(
      async () => ({ total: 0, agents: [] }),
      async (agentId) => ({ agentId }),
      invoke
    );

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });
    await client.callTool({ name: 'agents_invoke', arguments: { agentId: 'agent-1', inputs: {} } });
    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });
    const second = await client.callTool({ name: 'agents_invoke', arguments: { agentId: 'agent-1', inputs: {} } });

    expect(second.isError).not.toBe(true);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('returns the complete safe inventory as MCP text content', async () => {
    const inventory = {
      total: 1,
      agents: [{ agentId: 'agent-1', title: 'Agent 1', description: '', agentType: 'workflow' }],
    };
    const client = await connect(async () => inventory);

    const result = await client.callTool({ name: 'agents_list', arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(inventory) }]);
  });

  it('forwards an explicit inventory refresh request to the session cache boundary', async () => {
    const list = vi.fn().mockResolvedValue({ total: 0, agents: [] });
    const client = await connect(list);

    await client.callTool({ name: 'agents_list', arguments: { forceRefresh: true } });

    expect(list).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it('returns the exact schema for the requested catalog candidate', async () => {
    const description = {
      agentId: 'agent-1',
      title: 'Agent 1',
      description: '',
      agentType: 'workflow',
      inputSchema: [{ name: 'query', description: 'Query', type: 'text', required: true }],
      outputSchema: [],
    };
    const describeAgent = vi.fn().mockResolvedValue(description);
    const client = await connect(async () => ({ total: 0, agents: [] }), describeAgent);

    const result = await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });

    expect(describeAgent).toHaveBeenCalledWith('agent-1');
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(description) }]);
  });

  it('rejects a describe call without the required exact agentId before reading the catalog', async () => {
    const describeAgent = vi.fn();
    const client = await connect(async () => ({ total: 0, agents: [] }), describeAgent);

    const result = await client.callTool({ name: 'agents_describe', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: expect.stringMatching(/-32602:.*Invalid arguments.*agentId/su) },
    ]);
    expect(describeAgent).not.toHaveBeenCalled();
  });

  it('rejects nested invoke inputs before dispatching to the invoke client', async () => {
    const invoke = vi.fn();
    const client = await connect(
      async () => ({ total: 0, agents: [] }),
      async (agentId) => ({ agentId }),
      invoke
    );

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });
    const result = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-1', inputs: { query: { nested: true } } },
    });

    expect(result).toMatchObject({ isError: true });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('returns a distinct safe status when the exact candidate is no longer available', async () => {
    const client = await connect(
      async () => ({ total: 0, agents: [] }),
      async () => {
        throw new AgentsMcpError('not_found', 'private catalog detail');
      }
    );

    const result = await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: { code: 'not_found', message: 'Agent is not in the current catalog' },
        }),
      },
    ]);
  });

  it('returns a categorized error without forwarding sensitive details', async () => {
    const client = await connect(async () => {
      throw new AgentsMcpError('auth', 'Agents login is required: token=secret');
    });

    const result = await client.callTool({ name: 'agents_list', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({ ok: false, error: { code: 'auth', message: 'Agents login is required' } }),
      },
    ]);
  });

  it('maps an unexpected client failure to a safe server error', async () => {
    const client = await connect(async () => {
      throw new Error('private implementation detail');
    });

    const result = await client.callTool({ name: 'agents_list', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: { code: 'server', message: 'Agents catalog service is unavailable' },
        }),
      },
    ]);
  });
});
