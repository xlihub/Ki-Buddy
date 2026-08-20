import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAgentsMcpRuntimeBridge } from '@/process/ki-buddy/agents';
import { AgentsMcpError } from '@/process/ki-buddy/agents/errors';

const originalBridgeUrl = process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL;
const originalBridgeToken = process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN;
const authenticatedSession = {
  status: 'authenticated',
  user: {
    id: 'core-user',
    agents: { deploymentUrl: 'https://agents.example.test/tenant', userId: 'agents-user-1' },
  },
} as const;
const accountIdentity = {
  deploymentOrigin: 'https://agents.example.test',
  sessionEpoch: 1,
  userId: 'agents-user-1',
};

afterEach(() => {
  if (originalBridgeUrl === undefined) delete process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL;
  else process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL = originalBridgeUrl;
  if (originalBridgeToken === undefined) delete process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN;
  else process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN = originalBridgeToken;
});

describe('startAgentsMcpRuntimeBridge', () => {
  it('publishes only the loopback bridge coordinates into the Core child environment', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const startBridge = vi.fn().mockResolvedValue({
      url: 'http://127.0.0.1:43123',
      token: 'bridge-secret',
      close,
    });
    const authService = {
      getSession: vi.fn(),
      getSessionEpoch: vi.fn(),
      fetchAuthenticated: vi.fn(),
    };

    const handle = await startAgentsMcpRuntimeBridge(authService as never, process.env, startBridge);

    expect(process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL).toBe('http://127.0.0.1:43123');
    expect(process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN).toBe('bridge-secret');
    expect(JSON.stringify(process.env)).not.toContain('AGENTS_BASE_URL');
    await handle.close();
    expect(close).toHaveBeenCalledOnce();
    expect(process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL).toBeUndefined();
    expect(process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN).toBeUndefined();
  });

  it('requires an authenticated client session before forwarding catalog access', async () => {
    const getSession = vi.fn().mockResolvedValue({ status: 'unauthenticated', user: null });
    const fetchAuthenticated = vi.fn();
    let fetchCatalog: (() => Promise<Response>) | undefined;
    const startBridge = vi.fn(async (options: { fetchCatalog: () => Promise<Response> }) => {
      fetchCatalog = options.fetchCatalog;
      return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close: vi.fn() };
    });
    const handle = await startAgentsMcpRuntimeBridge(
      { getSession, getSessionEpoch: vi.fn().mockReturnValue(1), fetchAuthenticated } as never,
      process.env,
      startBridge as never
    );

    await expect(fetchCatalog?.()).rejects.toMatchObject({ code: 'auth' });
    expect(fetchAuthenticated).not.toHaveBeenCalled();
    await handle.close();
  });

  it('classifies a failed session lookup as an authentication error', async () => {
    const getSession = vi.fn().mockRejectedValue(new Error('credential store failed'));
    const fetchAuthenticated = vi.fn();
    let fetchCatalog: (() => Promise<Response>) | undefined;
    const startBridge = vi.fn(async (options: { fetchCatalog: () => Promise<Response> }) => {
      fetchCatalog = options.fetchCatalog;
      return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close: vi.fn() };
    });
    const handle = await startAgentsMcpRuntimeBridge(
      { getSession, getSessionEpoch: vi.fn().mockReturnValue(1), fetchAuthenticated } as never,
      process.env,
      startBridge as never
    );

    await expect(fetchCatalog?.()).rejects.toMatchObject({ code: 'auth', message: 'Agents login is required' });
    expect(fetchAuthenticated).not.toHaveBeenCalled();
    await handle.close();
  });

  it('uses the auth service boundary for the current catalog instead of exposing credentials', async () => {
    const response = Response.json({ status: 'ok', total: 0, agents: [] });
    const getSession = vi.fn().mockResolvedValue(authenticatedSession);
    const fetchAuthenticated = vi.fn().mockResolvedValue(response);
    let fetchCatalog: ((signal: AbortSignal) => Promise<Response>) | undefined;
    let getSessionIdentity: (() => Promise<unknown>) | undefined;
    const startBridge = vi.fn(
      async (options: {
        fetchCatalog: (signal: AbortSignal) => Promise<Response>;
        getSessionIdentity: () => Promise<unknown>;
      }) => {
        fetchCatalog = options.fetchCatalog;
        getSessionIdentity = options.getSessionIdentity;
        return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close: vi.fn() };
      }
    );
    const handle = await startAgentsMcpRuntimeBridge(
      { getSession, getSessionEpoch: vi.fn().mockReturnValue(1), fetchAuthenticated } as never,
      process.env,
      startBridge as never
    );

    const signal = new AbortController().signal;
    await expect(getSessionIdentity?.()).resolves.toEqual(accountIdentity);
    await expect(fetchCatalog?.(signal)).resolves.toEqual({ identity: accountIdentity, response });
    expect(fetchAuthenticated).toHaveBeenCalledWith('/bridge/agents/catalog', {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    });
    await handle.close();
  });

  it('posts only the validated invoke projection through the authenticated Agents boundary', async () => {
    const response = Response.json({ status: 'completed' });
    const getSession = vi.fn().mockResolvedValue(authenticatedSession);
    const fetchAuthenticated = vi.fn().mockResolvedValue(response);
    let invokeAgent:
      | ((request: unknown, identity: typeof accountIdentity, signal: AbortSignal) => Promise<Response>)
      | undefined;
    const startBridge = vi.fn(
      async (options: {
        invokeAgent: (request: unknown, identity: typeof accountIdentity, signal: AbortSignal) => Promise<Response>;
      }) => {
        invokeAgent = options.invokeAgent;
        return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close: vi.fn() };
      }
    );
    const handle = await startAgentsMcpRuntimeBridge(
      { getSession, getSessionEpoch: vi.fn().mockReturnValue(1), fetchAuthenticated } as never,
      process.env,
      startBridge as never
    );
    const signal = new AbortController().signal;
    const request = {
      agentId: 'agent-1',
      agentType: 'workflow',
      conversationId: 'ki-buddy-request-1',
      inputs: { query: 'Summarize this.' },
    };

    await expect(invokeAgent?.(request, accountIdentity, signal)).resolves.toBe(response);

    expect(fetchAuthenticated).toHaveBeenCalledWith('/bridge/agents/invoke', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    await handle.close();
  });

  it('stops invoke dispatch when the authenticated Agents identity changed after catalog validation', async () => {
    const switchedSession = {
      ...authenticatedSession,
      user: {
        ...authenticatedSession.user,
        agents: { ...authenticatedSession.user.agents, userId: 'agents-user-2' },
      },
    };
    const getSession = vi.fn().mockResolvedValue(switchedSession);
    const fetchAuthenticated = vi.fn();
    let invokeAgent:
      | ((request: unknown, identity: typeof accountIdentity, signal: AbortSignal) => Promise<Response>)
      | undefined;
    const startBridge = vi.fn(
      async (options: {
        invokeAgent: (request: unknown, identity: typeof accountIdentity, signal: AbortSignal) => Promise<Response>;
      }) => {
        invokeAgent = options.invokeAgent;
        return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close: vi.fn() };
      }
    );
    const handle = await startAgentsMcpRuntimeBridge(
      { getSession, getSessionEpoch: vi.fn().mockReturnValue(1), fetchAuthenticated } as never,
      process.env,
      startBridge as never
    );

    await expect(
      invokeAgent?.(
        { agentId: 'agent-1', agentType: 'workflow', conversationId: 'ki-buddy-request-1', inputs: {} },
        accountIdentity,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'auth' });
    expect(fetchAuthenticated).not.toHaveBeenCalled();
    await handle.close();
  });

  it('classifies an unexpected catalog request failure as a network error', async () => {
    const getSession = vi.fn().mockResolvedValue(authenticatedSession);
    const fetchAuthenticated = vi.fn().mockRejectedValue(new Error('private upstream detail'));
    let fetchCatalog: (() => Promise<Response>) | undefined;
    const startBridge = vi.fn(async (options: { fetchCatalog: () => Promise<Response> }) => {
      fetchCatalog = options.fetchCatalog;
      return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close: vi.fn() };
    });
    const handle = await startAgentsMcpRuntimeBridge(
      { getSession, getSessionEpoch: vi.fn().mockReturnValue(1), fetchAuthenticated } as never,
      process.env,
      startBridge as never
    );

    await expect(fetchCatalog?.()).rejects.toMatchObject({
      code: 'network',
      message: 'Agents catalog request failed',
    });
    await handle.close();
  });

  it('rejects a catalog response when the Agents account changes during refresh', async () => {
    const switchedSession = {
      ...authenticatedSession,
      user: {
        ...authenticatedSession.user,
        agents: { ...authenticatedSession.user.agents, userId: 'agents-user-2' },
      },
    };
    const getSession = vi.fn().mockResolvedValueOnce(authenticatedSession).mockResolvedValueOnce(switchedSession);
    const fetchAuthenticated = vi.fn().mockResolvedValue(Response.json({ status: 'ok', total: 0, agents: [] }));
    let fetchCatalog: ((signal: AbortSignal) => Promise<unknown>) | undefined;
    const startBridge = vi.fn(async (options: { fetchCatalog: (signal: AbortSignal) => Promise<unknown> }) => {
      fetchCatalog = options.fetchCatalog;
      return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close: vi.fn() };
    });
    const handle = await startAgentsMcpRuntimeBridge(
      { getSession, getSessionEpoch: vi.fn().mockReturnValue(1), fetchAuthenticated } as never,
      process.env,
      startBridge as never
    );

    await expect(fetchCatalog?.(new AbortController().signal)).rejects.toMatchObject({ code: 'auth' });
    await handle.close();
  });

  it('rejects a catalog response when the same account session changes during refresh', async () => {
    const getSession = vi.fn().mockResolvedValue(authenticatedSession);
    const getSessionEpoch = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);
    const fetchAuthenticated = vi.fn().mockResolvedValue(Response.json({ status: 'ok', total: 0, agents: [] }));
    let fetchCatalog: ((signal: AbortSignal) => Promise<unknown>) | undefined;
    const startBridge = vi.fn(async (options: { fetchCatalog: (signal: AbortSignal) => Promise<unknown> }) => {
      fetchCatalog = options.fetchCatalog;
      return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close: vi.fn() };
    });
    const handle = await startAgentsMcpRuntimeBridge(
      { getSession, getSessionEpoch, fetchAuthenticated } as never,
      process.env,
      startBridge as never
    );

    await expect(fetchCatalog?.(new AbortController().signal)).rejects.toMatchObject({ code: 'auth' });
    await handle.close();
  });

  it('preserves an error already classified by the authenticated Agents boundary', async () => {
    const classifiedError = new AgentsMcpError('server', 'Agents catalog service is unavailable');
    const getSession = vi.fn().mockResolvedValue(authenticatedSession);
    const fetchAuthenticated = vi.fn().mockRejectedValue(classifiedError);
    let fetchCatalog: (() => Promise<Response>) | undefined;
    const startBridge = vi.fn(async (options: { fetchCatalog: () => Promise<Response> }) => {
      fetchCatalog = options.fetchCatalog;
      return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close: vi.fn() };
    });
    const handle = await startAgentsMcpRuntimeBridge(
      { getSession, getSessionEpoch: vi.fn().mockReturnValue(1), fetchAuthenticated } as never,
      process.env,
      startBridge as never
    );

    await expect(fetchCatalog?.()).rejects.toBe(classifiedError);
    await handle.close();
  });
});
