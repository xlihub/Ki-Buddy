import { describe, expect, it, vi } from 'vitest';
import { createAgentsCatalogClient } from '@/process/ki-buddy/agents/client';

const validCatalog = {
  status: 'ok',
  total: 1,
  agents: [
    {
      agentId: 'agent-feedback',
      agentTitle: 'Feedback analyst',
      agentDescription: 'Summarizes customer feedback.',
      agentType: 'workflow',
    },
  ],
};

describe('createAgentsCatalogClient', () => {
  it('loads a complete inventory only through the authenticated loopback bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validCatalog));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await expect(client.list()).resolves.toEqual({
      total: 1,
      agents: [
        {
          agentId: 'agent-feedback',
          title: 'Feedback analyst',
          description: 'Summarizes customer feedback.',
          agentType: 'workflow',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:43123/catalog', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer bridge-secret',
      },
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects non-loopback bridge configuration before making a request', async () => {
    const fetchMock = vi.fn();

    expect(() =>
      createAgentsCatalogClient({
        bridgeUrl: 'https://agents.example.test',
        bridgeToken: 'bridge-secret',
        fetchImpl: fetchMock,
      })
    ).toThrow('Agents Adapter bridge URL must use loopback HTTP');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns stable error categories without exposing bridge response details', async () => {
    const authClient = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: vi.fn().mockResolvedValue(Response.json({ error: 'secret detail' }, { status: 401 })),
    });
    const contractClient = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: vi.fn().mockResolvedValue(Response.json({ error: 'agents_contract_error' }, { status: 502 })),
    });
    const upstreamNetworkClient = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: vi.fn().mockResolvedValue(Response.json({ error: 'agents_network_error' }, { status: 502 })),
    });
    const serverClient = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: vi.fn().mockResolvedValue(Response.json({ error: 'agents_server_error' }, { status: 502 })),
    });
    const networkClient = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:43123')),
    });

    await expect(authClient.list()).rejects.toMatchObject({ code: 'auth', message: 'Agents login is required' });
    await expect(contractClient.list()).rejects.toMatchObject({
      code: 'contract',
      message: 'Agents catalog response is incompatible',
    });
    await expect(upstreamNetworkClient.list()).rejects.toMatchObject({
      code: 'network',
      message: 'Agents Adapter bridge is unavailable',
    });
    await expect(serverClient.list()).rejects.toMatchObject({
      code: 'server',
      message: 'Agents catalog service is unavailable',
    });
    await expect(networkClient.list()).rejects.toMatchObject({
      code: 'network',
      message: 'Agents Adapter bridge is unavailable',
    });
  });
});
