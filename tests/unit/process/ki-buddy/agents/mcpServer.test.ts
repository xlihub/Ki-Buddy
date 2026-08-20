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

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connect(
  list: (options?: { forceRefresh?: boolean }) => Promise<unknown>,
  describeAgent: (agentId: string) => Promise<unknown> = async () => ({})
) {
  const server = createAgentsMcpServer({ describe: describeAgent, list } as never);
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

    expect(result.tools.map(({ name }) => name)).toEqual(['agents_list', 'agents_describe']);
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
