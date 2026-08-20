import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterEach, describe, expect, it } from 'vitest';
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

async function connect(list: () => Promise<unknown>) {
  const server = createAgentsMcpServer({ list } as never);
  const client = new Client({ name: 'agents-mcp-test', version: '1.0.0' });
  const [serverTransport, clientTransport] = linkedTransports();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

describe('createAgentsMcpServer', () => {
  it('publishes only the read-only complete catalog tool', async () => {
    const client = await connect(async () => ({ total: 0, agents: [] }));

    const result = await client.listTools();

    expect(result.tools.map(({ name }) => name)).toEqual(['agents_list']);
    expect(result.tools[0]).toMatchObject({
      name: 'agents_list',
      annotations: { readOnlyHint: true },
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
});
