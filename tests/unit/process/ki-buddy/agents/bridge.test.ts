import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAgentsMcpBridge, type AgentsMcpBridgeHandle } from '@/process/ki-buddy/agents/bridge';
import { AgentsMcpError } from '@/process/ki-buddy/agents/errors';

const handles: AgentsMcpBridgeHandle[] = [];
const identity = { deploymentOrigin: 'https://agents.example.test', sessionEpoch: 1, userId: 'user-1' };

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

describe('startAgentsMcpBridge', () => {
  it('serves the current authenticated Agents catalog only to the Adapter token', async () => {
    const catalog = {
      status: 'ok',
      total: 1,
      agents: [{ agentId: 'agent-1', agentTitle: 'Agent 1', agentType: 'workflow' }],
    };
    const getSessionIdentity = vi.fn().mockResolvedValue(identity);
    const fetchCatalog = vi.fn().mockResolvedValue({ identity, response: Response.json(catalog) });
    const bridge = await startAgentsMcpBridge({ fetchCatalog, getSessionIdentity, token: 'bridge-secret' });
    handles.push(bridge);

    const catalogResponse = await fetch(`${bridge.url}/catalog`, {
      headers: { authorization: `Bearer ${bridge.token}` },
    });
    const sessionResponse = await fetch(`${bridge.url}/session`, {
      headers: { authorization: `Bearer ${bridge.token}` },
    });

    expect(catalogResponse.status).toBe(200);
    await expect(catalogResponse.json()).resolves.toEqual({ identity, catalog });
    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toEqual(identity);
    expect(fetchCatalog).toHaveBeenCalledOnce();
    expect(getSessionIdentity).toHaveBeenCalledOnce();
  });

  it('rejects requests without the exact Adapter token before reading the Agents session', async () => {
    const fetchCatalog = vi.fn();
    const getSessionIdentity = vi.fn();
    const bridge = await startAgentsMcpBridge({ fetchCatalog, getSessionIdentity, token: 'bridge-secret' });
    handles.push(bridge);

    const response = await fetch(`${bridge.url}/catalog`, {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    expect(response.status).toBe(401);
    expect(fetchCatalog).not.toHaveBeenCalled();
    expect(getSessionIdentity).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: 'adapter_auth_required' });
  });

  it('returns an authentication status when the current session identity is unavailable', async () => {
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn(),
      getSessionIdentity: vi.fn().mockRejectedValue(new AgentsMcpError('auth', 'private session detail')),
      token: 'bridge-secret',
    });
    handles.push(bridge);

    const response = await fetch(`${bridge.url}/session`, {
      headers: { authorization: `Bearer ${bridge.token}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'agents_auth_required' });
  });

  it('cancels the upstream catalog request when the Adapter request disconnects', async () => {
    let releaseStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    let upstreamSignal: AbortSignal | undefined;
    const fetchCatalog = vi.fn((signal?: AbortSignal) => {
      upstreamSignal = signal;
      releaseStarted?.();
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const bridge = await startAgentsMcpBridge({
      fetchCatalog,
      getSessionIdentity: vi.fn().mockResolvedValue(identity),
      token: 'bridge-secret',
    });
    handles.push(bridge);
    const requestController = new AbortController();
    const request = fetch(`${bridge.url}/catalog`, {
      headers: { authorization: `Bearer ${bridge.token}` },
      signal: requestController.signal,
    }).catch(() => undefined);

    await started;
    requestController.abort();

    await expect.poll(() => upstreamSignal?.aborted).toBe(true);
    await request;
  });

  it('cancels active upstream requests when the Bridge closes', async () => {
    let releaseStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    let upstreamSignal: AbortSignal | undefined;
    const fetchCatalog = vi.fn((signal: AbortSignal) => {
      upstreamSignal = signal;
      releaseStarted?.();
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const bridge = await startAgentsMcpBridge({
      fetchCatalog,
      getSessionIdentity: vi.fn().mockResolvedValue(identity),
      token: 'bridge-secret',
    });
    const request = fetch(`${bridge.url}/catalog`, {
      headers: { authorization: `Bearer ${bridge.token}` },
    }).catch(() => undefined);

    await started;
    await bridge.close();

    expect(upstreamSignal?.aborted).toBe(true);
    await request;
  });

  it('maps authentication, network, server, and contract failures to safe bridge responses', async () => {
    const cases = [
      { error: new AgentsMcpError('auth', 'token detail'), expectedStatus: 401, expectedCode: 'agents_auth_required' },
      {
        error: new AgentsMcpError('network', 'host detail'),
        expectedStatus: 502,
        expectedCode: 'agents_network_error',
      },
      { error: new AgentsMcpError('server', 'body detail'), expectedStatus: 502, expectedCode: 'agents_server_error' },
      {
        error: new AgentsMcpError('contract', 'payload detail'),
        expectedStatus: 502,
        expectedCode: 'agents_contract_error',
      },
    ];

    for (const testCase of cases) {
      const bridge = await startAgentsMcpBridge({
        fetchCatalog: vi.fn().mockRejectedValue(testCase.error),
        getSessionIdentity: vi.fn().mockResolvedValue(identity),
        token: `bridge-secret-${testCase.expectedCode}`,
      });
      handles.push(bridge);
      const response = await fetch(`${bridge.url}/catalog`, {
        headers: { authorization: `Bearer ${bridge.token}` },
      });
      expect(response.status).toBe(testCase.expectedStatus);
      await expect(response.json()).resolves.toEqual({ error: testCase.expectedCode });
    }
  });
});
