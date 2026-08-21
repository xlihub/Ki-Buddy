import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAgentsMcpBridge, type AgentsMcpBridgeHandle } from '@/process/ki-buddy/agents/bridge';

const handles: AgentsMcpBridgeHandle[] = [];
const catalog = {
  status: 'ok',
  total: 1,
  agents: [
    {
      agentId: 'agent-1',
      agentTitle: 'Agent 1',
      agentType: 'workflow',
      defaultInputModes: [{ name: 'query', description: 'Query', type: 'text', required: true }],
      defaultOutputModes: [],
    },
  ],
};
const currentCatalog = () => ({ response: Response.json(catalog), sessionEpoch: 1 });

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

async function request(
  bridge: AgentsMcpBridgeHandle,
  path: '/catalog' | '/invoke',
  body?: unknown,
  clientId = '11111111-1111-4111-8111-111111111111'
) {
  return fetch(`${bridge.url}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${bridge.token}`,
      'x-ki-buddy-agents-client-id': clientId,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('startAgentsMcpBridge', () => {
  it('serves the current authenticated catalog without exposing session identity', async () => {
    const fetchCatalog = vi.fn().mockImplementation(async () => currentCatalog());
    const bridge = await startAgentsMcpBridge({ fetchCatalog, token: 'bridge-secret' });
    handles.push(bridge);

    const response = await request(bridge, '/catalog');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(catalog);
    expect(fetchCatalog).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', expect.any(AbortSignal));
  });

  it('rejects requests without the exact Adapter token before remote access', async () => {
    const fetchCatalog = vi.fn();
    const bridge = await startAgentsMcpBridge({ fetchCatalog, token: 'bridge-secret' });
    handles.push(bridge);

    const response = await fetch(`${bridge.url}/catalog`, {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    expect(response.status).toBe(401);
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-client-id'],
  ])('rejects a %s stdio client identity before remote access', async (_name, clientId) => {
    const fetchCatalog = vi.fn();
    const bridge = await startAgentsMcpBridge({ fetchCatalog, token: `bridge-secret-${_name}` });
    handles.push(bridge);

    const response = await fetch(`${bridge.url}/catalog`, {
      headers: {
        authorization: `Bearer ${bridge.token}`,
        ...(clientId ? { 'x-ki-buddy-agents-client-id': clientId } : {}),
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'agents_invalid_input' });
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it.each([
    ['missing required input', {}],
    ['field outside schema', { query: 'Summary', apiKey: 'must-not-dispatch' }],
    ['non-scalar input', { query: { nested: true } }],
  ])('rejects %s against a freshly fetched schema before remote invoke', async (_name, inputs) => {
    const invokeAgent = vi.fn();
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      invokeAgent,
      token: `bridge-secret-${_name}`,
    });
    handles.push(bridge);

    const response = await request(bridge, '/invoke', { agentId: 'agent-1', inputs });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'agents_invalid_input' });
    expect(invokeAgent).not.toHaveBeenCalled();
  });

  it('dispatches after fresh catalog validation and forwards the complete successful JSON response', async () => {
    const upstreamResult = {
      state: 'submitted',
      authorization: 'business authorization value',
      headers: { source: 'business result' },
      debug: { trace: 'business result' },
      result: {
        token: 'business token',
        result_file: { name: 'statement.xlsx', path: '/remote/result/statement.xlsx' },
        outputs: [{ kind: 'table', rows: 12 }],
      },
    };
    const invokeAgent = vi.fn().mockResolvedValue(Response.json(upstreamResult));
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      invokeAgent,
      token: 'bridge-secret-invoke',
    });
    handles.push(bridge);

    const response = await request(bridge, '/invoke', {
      agentId: 'agent-1',
      inputs: { query: 'Summary' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(upstreamResult);
    expect(invokeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1', agentType: 'workflow', inputs: { query: 'Summary' } }),
      1,
      '11111111-1111-4111-8111-111111111111',
      expect.any(AbortSignal)
    );
  });

  it('keeps concurrent clients distinct across the shared loopback bridge', async () => {
    const clients: string[] = [];
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async (clientId: string) => {
        clients.push(clientId);
        return currentCatalog();
      }),
      token: 'bridge-secret-client-isolation',
    });
    handles.push(bridge);

    await Promise.all([
      request(bridge, '/catalog', undefined, '11111111-1111-4111-8111-111111111111'),
      request(bridge, '/catalog', undefined, '22222222-2222-4222-8222-222222222222'),
    ]);

    expect(clients.toSorted()).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('serves a concurrent catalog request while an invoke response is pending', async () => {
    let finishInvoke: ((response: Response) => void) | undefined;
    const invokeAgent = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finishInvoke = resolve;
        })
    );
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      invokeAgent,
      token: 'bridge-secret-concurrent',
    });
    handles.push(bridge);

    const invoke = request(bridge, '/invoke', { agentId: 'agent-1', inputs: { query: 'Summary' } });
    await vi.waitFor(() => expect(invokeAgent).toHaveBeenCalledOnce());

    const catalogResponse = await request(bridge, '/catalog');
    expect(catalogResponse.status).toBe(200);
    await expect(catalogResponse.json()).resolves.toEqual(catalog);

    finishInvoke?.(Response.json({ state: 'completed', result: { rows: [] } }));
    await expect(invoke.then((result) => result.json())).resolves.toEqual({ state: 'completed', result: { rows: [] } });
  });

  it('reports a transport loss after dispatch as result unknown', async () => {
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      invokeAgent: vi.fn().mockRejectedValue(new Error('socket closed after remote completion')),
      token: 'bridge-secret-result-unknown',
    });
    handles.push(bridge);

    const response = await request(bridge, '/invoke', {
      agentId: 'agent-1',
      inputs: { query: 'Summary' },
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'agents_result_unknown',
      correlation: { agentId: 'agent-1' },
    });
  });

  it('returns not found when the selected agent is absent from the fresh catalog', async () => {
    const invokeAgent = vi.fn();
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockResolvedValue({
        response: Response.json({ status: 'ok', total: 0, agents: [] }),
        sessionEpoch: 1,
      }),
      invokeAgent,
      token: 'bridge-secret-not-found',
    });
    handles.push(bridge);

    const response = await request(bridge, '/invoke', { agentId: 'agent-1', inputs: {} });

    expect(response.status).toBe(404);
    expect(invokeAgent).not.toHaveBeenCalled();
  });
});
