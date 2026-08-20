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
      defaultInputModes: [
        {
          name: 'attachment',
          description: 'A source document.',
          type: 'file',
          required: true,
          allowed_file_types: ['application/pdf'],
        },
      ],
      defaultOutputModes: [{ name: 'summary', description: 'The generated summary.', type: 'text', required: true }],
    },
  ],
};

const accountIdentity = { deploymentOrigin: 'https://agents.example.test', sessionEpoch: 1, userId: 'user-1' };

describe('createAgentsCatalogClient', () => {
  it('describes the exact schema for one current catalog candidate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ identity: accountIdentity, catalog: validCatalog }));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await expect(client.describe('agent-feedback')).resolves.toEqual({
      agentId: 'agent-feedback',
      title: 'Feedback analyst',
      description: 'Summarizes customer feedback.',
      agentType: 'workflow',
      inputSchema: [
        {
          name: 'attachment',
          description: 'A source document.',
          type: 'file',
          required: true,
          allowed_file_types: ['application/pdf'],
        },
      ],
      outputSchema: [{ name: 'summary', description: 'The generated summary.', type: 'text', required: true }],
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:43123/catalog', expect.any(Object));
  });

  it('loads a complete inventory only through the authenticated loopback bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ identity: accountIdentity, catalog: validCatalog }));
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

  it('caches inventory for five minutes within the same deployment, account, and Adapter session', async () => {
    let currentTime = 10_000;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      return Promise.resolve(
        Response.json(path === '/session' ? accountIdentity : { identity: accountIdentity, catalog: validCatalog })
      );
    });
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock as typeof fetch,
      now: () => currentTime,
    });

    await client.list();
    await client.list();
    currentTime += 5 * 60 * 1000;
    await client.list();

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/catalog',
      '/session',
      '/catalog',
    ]);
  });

  it('forces a catalog refresh without using the cached inventory', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ identity: accountIdentity, catalog: validCatalog })));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await client.list();
    await client.list({ forceRefresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([input]) => new URL(String(input)).pathname === '/catalog')).toBe(true);
  });

  it('does not reuse a previous account inventory after the session identity changes', async () => {
    const accountBIdentity = { deploymentOrigin: 'https://agents.example.test', sessionEpoch: 2, userId: 'user-2' };
    const accountBCatalog = {
      status: 'ok',
      total: 1,
      agents: [
        {
          agentId: 'agent-account-b',
          agentTitle: 'Account B agent',
          agentDescription: '',
          agentType: 'workflow',
          defaultInputModes: [],
          defaultOutputModes: [],
        },
      ],
    };
    const responses = [
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
      Response.json(accountBIdentity),
      Response.json({ identity: accountBIdentity, catalog: accountBCatalog }),
    ];
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift() as Response));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await client.list();
    await expect(client.list()).resolves.toMatchObject({ agents: [{ agentId: 'agent-account-b' }] });

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/catalog',
      '/session',
      '/catalog',
    ]);
  });

  it('does not reuse inventory after the same account starts a new authenticated session', async () => {
    const renewedIdentity = { ...accountIdentity, sessionEpoch: 2 };
    const renewedCatalog = {
      ...validCatalog,
      agents: [{ ...validCatalog.agents[0], agentId: 'agent-after-reauthentication' }],
    };
    const responses = [
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
      Response.json(renewedIdentity),
      Response.json({ identity: renewedIdentity, catalog: renewedCatalog }),
    ];
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift() as Response));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await client.list();
    await expect(client.list()).resolves.toMatchObject({
      agents: [{ agentId: 'agent-after-reauthentication' }],
    });

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/catalog',
      '/session',
      '/catalog',
    ]);
  });

  it('does not reuse inventory when the same Adapter session changes deployment origin', async () => {
    const otherDeploymentIdentity = {
      deploymentOrigin: 'https://other-agents.example.test',
      sessionEpoch: 1,
      userId: 'user-1',
    };
    const otherDeploymentCatalog = {
      ...validCatalog,
      agents: [{ ...validCatalog.agents[0], agentId: 'agent-other-deployment' }],
    };
    const responses = [
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
      Response.json(otherDeploymentIdentity),
      Response.json({ identity: otherDeploymentIdentity, catalog: otherDeploymentCatalog }),
    ];
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift() as Response));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await client.list();
    await expect(client.list()).resolves.toMatchObject({ agents: [{ agentId: 'agent-other-deployment' }] });

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/catalog',
      '/session',
      '/catalog',
    ]);
  });

  it('does not share inventory across Adapter sessions', async () => {
    const fetchA = vi.fn(() => Promise.resolve(Response.json({ identity: accountIdentity, catalog: validCatalog })));
    const fetchB = vi.fn(() => Promise.resolve(Response.json({ identity: accountIdentity, catalog: validCatalog })));
    const clientA = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret-a',
      fetchImpl: fetchA as typeof fetch,
    });
    const clientB = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43124',
      bridgeToken: 'bridge-secret-b',
      fetchImpl: fetchB as typeof fetch,
    });

    await clientA.list();
    await clientB.list();

    expect(fetchA).toHaveBeenCalledOnce();
    expect(fetchB).toHaveBeenCalledOnce();
  });

  it('clears the cached account after authentication is invalidated', async () => {
    const responses = [
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
      Response.json({ error: 'agents_auth_required' }, { status: 401 }),
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
    ];
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift() as Response));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await client.list();
    await expect(client.list()).rejects.toMatchObject({ code: 'auth' });
    await client.list();

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/catalog',
      '/session',
      '/catalog',
    ]);
  });

  it('clears cached inventory when the session epoch is incompatible', async () => {
    const responses = [
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
      Response.json({ ...accountIdentity, sessionEpoch: -1 }),
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
    ];
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift() as Response));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await client.list();
    await expect(client.list()).rejects.toMatchObject({ code: 'contract' });
    await client.list();

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/catalog',
      '/session',
      '/catalog',
    ]);
  });

  it('reconfirms catalog membership before describe and discards a revoked candidate', async () => {
    const emptyCatalog = { status: 'ok', total: 0, agents: [] };
    const responses = [
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
      Response.json({ identity: accountIdentity, catalog: emptyCatalog }),
      Response.json({ identity: accountIdentity, catalog: emptyCatalog }),
    ];
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift() as Response));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await client.list();
    await expect(client.describe('agent-feedback')).rejects.toMatchObject({ code: 'not_found' });
    await expect(client.list()).resolves.toEqual({ total: 0, agents: [] });

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/catalog',
      '/catalog',
      '/catalog',
    ]);
  });

  it('fails closed when the selected candidate schema is incompatible', async () => {
    const incompatibleCatalog = {
      ...validCatalog,
      agents: [{ ...validCatalog.agents[0], defaultInputModes: [{ name: 'query', type: 'text' }] }],
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ identity: accountIdentity, catalog: incompatibleCatalog }))
    );
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.describe('agent-feedback')).rejects.toMatchObject({ code: 'contract' });
  });

  it('discards cached inventory when a forced refresh finds an ambiguous catalog', async () => {
    const duplicateCatalog = {
      ...validCatalog,
      total: 2,
      agents: [validCatalog.agents[0], validCatalog.agents[0]],
    };
    const responses = [
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
      Response.json({ identity: accountIdentity, catalog: duplicateCatalog }),
      Response.json({ identity: accountIdentity, catalog: validCatalog }),
    ];
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift() as Response));
    const client = createAgentsCatalogClient({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      fetchImpl: fetchMock,
    });

    await client.list();
    await expect(client.list({ forceRefresh: true })).rejects.toMatchObject({ code: 'ambiguous' });
    await client.list();

    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/catalog',
      '/catalog',
      '/catalog',
    ]);
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
