import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentsClient } from '@/process/ki-buddy/agents/client';
import { AgentsMcpError } from '@/process/ki-buddy/agents/errors';
import { createAgentsMcpServer } from '@/process/ki-buddy/agents/mcpServer';

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

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connect(overrides: Partial<AgentsClient> = {}) {
  const adapter: AgentsClient = {
    list: async () => ({ total: 0, agents: [] }),
    describe: async (agentId) => ({
      agentId,
      title: 'Agent',
      description: '',
      agentType: 'workflow',
      inputSchema: [],
      outputSchema: [],
    }),
    invoke: async (agentId) => ({ agentId, text: 'Done.' }),
    upload: async (_agentId, _fieldName, _filePath) => ({
      fileUrl: 'https://agents.example.test/files/remote-1',
      fileName: 'feedback.txt',
      size: 12,
    }),
    ...overrides,
  };
  const server = createAgentsMcpServer(adapter);
  const client = new Client({ name: 'agents-mcp-test', version: '1.0.0' });
  const serverTransport = new LinkedTransport();
  const clientTransport = new LinkedTransport();
  serverTransport.peer = clientTransport;
  clientTransport.peer = serverTransport;
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

describe('createAgentsMcpServer', () => {
  it('publishes catalog, upload, and execution tools', async () => {
    const client = await connect();

    const result = await client.listTools();

    expect(result.tools.map(({ name }) => name)).toEqual([
      'agents_list',
      'agents_describe',
      'agents_upload_file',
      'agents_invoke',
    ]);
    expect(result.tools[0]).toMatchObject({ annotations: { readOnlyHint: true }, inputSchema: { properties: {} } });
    expect(result.tools[2]).toMatchObject({ annotations: { destructiveHint: false, idempotentHint: false } });
    expect(result.tools[2]?.inputSchema).toMatchObject({
      properties: { filePath: { type: 'string' } },
      required: expect.arrayContaining(['filePath']),
    });
    expect(JSON.stringify(result.tools[2]?.inputSchema)).not.toContain('attachmentIndex');
    expect(result.tools[3]).toMatchObject({ annotations: { destructiveHint: true, idempotentHint: false } });
  });

  it('uploads one absolute local path for one exact file field', async () => {
    const upload = vi.fn().mockResolvedValue({
      fileUrl: 'https://agents.example.test/files/remote-1',
      fileName: 'feedback.txt',
      size: 12,
    });
    const client = await connect({ upload });

    const result = await client.callTool({
      name: 'agents_upload_file',
      arguments: {
        agentId: 'agent-1',
        fieldName: 'source',
        filePath: '/tmp/feedback.txt',
      },
    });

    expect(result.isError).not.toBe(true);
    expect(upload).toHaveBeenCalledWith('agent-1', 'source', '/tmp/feedback.txt');
  });

  it('returns the current inventory and exact selected schema', async () => {
    const inventory = {
      total: 1,
      agents: [{ agentId: 'agent-1', title: 'Agent 1', description: '', agentType: 'workflow' }],
    };
    const describeAgent = vi.fn().mockResolvedValue({
      ...inventory.agents[0],
      inputSchema: [],
      outputSchema: [],
    });
    const client = await connect({ list: async () => inventory, describe: describeAgent });

    const listResult = await client.callTool({ name: 'agents_list', arguments: {} });
    const describeResult = await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-1' } });

    expect(listResult.content).toEqual([{ type: 'text', text: JSON.stringify(inventory) }]);
    expect(describeResult.isError).not.toBe(true);
    expect(describeAgent).toHaveBeenCalledWith('agent-1');
  });

  it('allows direct invoke without hidden describe state', async () => {
    const invoke = vi.fn().mockResolvedValue({ agentId: 'agent-1', text: 'Done.' });
    const client = await connect({ invoke });

    const result = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-1', inputs: { query: 'Summary' } },
    });

    expect(result.isError).not.toBe(true);
    expect(invoke).toHaveBeenCalledWith('agent-1', { query: 'Summary' });
  });

  it('rejects nested inputs before dispatch', async () => {
    const invoke = vi.fn();
    const client = await connect({ invoke });

    const result = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-1', inputs: { query: { nested: true } } },
    });

    expect(result.isError).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('returns result unknown without exposing private transport details', async () => {
    const client = await connect({
      invoke: async () => {
        throw new AgentsMcpError('result_unknown', 'socket closed token=secret', { agentId: 'agent-1' });
      },
    });

    const result = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-1', inputs: {} },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            agentId: 'agent-1',
            error: { code: 'result_unknown', message: 'Agent execution result is unknown' },
          }),
        },
      ],
    });
  });

  it('maps unexpected failures to a safe server error', async () => {
    const client = await connect({
      list: async () => {
        throw new Error('private implementation detail');
      },
    });

    const result = await client.callTool({ name: 'agents_list', arguments: {} });

    expect(result.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({
          ok: false,
          error: { code: 'server', message: 'Agents service returned an error' },
        }),
      },
    ]);
  });
});
