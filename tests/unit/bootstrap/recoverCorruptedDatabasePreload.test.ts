import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/electron/preload', () => ({}));

const invoke = vi.fn();
const send = vi.fn();
const on = vi.fn();
const off = vi.fn();
let productRuntime: string | null = null;
let productCsrfToken: string | null = null;
const sendSync = vi.fn((channel: string) => {
  if (channel === 'get-product-runtime-identity') return productRuntime;
  if (channel === 'ki-buddy:core-transport:get-csrf-token') return productCsrfToken;
  if (channel === 'get-backend-port') return 25808;
  if (channel === 'get-initial-language') return null;
  if (channel === 'get-backend-startup-failed') return false;
  if (channel === 'get-backend-startup-failure') return null;
  return null;
});
const exposeInMainWorld = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    off,
    on,
    send,
    sendSync,
  },
  webUtils: {
    getPathForFile: vi.fn(),
  },
}));

describe('recover corrupted database preload bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    invoke.mockResolvedValue(undefined);
    productRuntime = null;
    productCsrfToken = null;
  });

  it('exposes a recovery method that invokes the main-process IPC channel', async () => {
    await import('@/preload/main');

    const electronApiCall = exposeInMainWorld.mock.calls.find(([key]) => key === 'electronAPI');
    const electronApi = electronApiCall?.[1] as { recoverCorruptedDatabase?: () => Promise<void> } | undefined;

    await electronApi?.recoverCorruptedDatabase?.();

    expect(invoke).toHaveBeenCalledWith('backend:recover-corrupted-database');
  });

  it('exposes Ki-Buddy authentication only through the dedicated IPC channels', async () => {
    productRuntime = 'ki-buddy';
    productCsrfToken = 'core-csrf-token';
    await import('@/preload/main');

    const electronApiCall = exposeInMainWorld.mock.calls.find(([key]) => key === 'electronAPI');
    const electronApi = electronApiCall?.[1] as
      | {
          kiBuddyAuth?: {
            getSession: () => Promise<unknown>;
            login: (request: { baseUrl: string; loginName: string; password: string }) => Promise<unknown>;
            logout: () => Promise<unknown>;
            onSessionInvalidated: (listener: () => void) => () => void;
          };
          kiBuddyCoreTransport?: { csrfToken: string };
        }
      | undefined;
    const request = {
      baseUrl: 'https://agents.example.com',
      loginName: 'agents-user@example.com',
      password: 'password',
    };

    await electronApi?.kiBuddyAuth?.getSession();
    await electronApi?.kiBuddyAuth?.login(request);
    await electronApi?.kiBuddyAuth?.logout();
    const invalidated = vi.fn();
    const unsubscribe = electronApi?.kiBuddyAuth?.onSessionInvalidated(invalidated);
    const subscription = on.mock.calls.find(([channel]) => channel === 'ki-buddy-auth:session-invalidated');
    subscription?.[1]();
    unsubscribe?.();

    expect(invoke).toHaveBeenCalledWith('ki-buddy-auth:get-session');
    expect(invoke).toHaveBeenCalledWith('ki-buddy-auth:login', request);
    expect(invoke).toHaveBeenCalledWith('ki-buddy-auth:logout');
    expect(invalidated).toHaveBeenCalledOnce();
    expect(off).toHaveBeenCalledWith('ki-buddy-auth:session-invalidated', subscription?.[1]);
    expect(electronApi?.kiBuddyCoreTransport).toEqual({ csrfToken: 'core-csrf-token' });
  });

  it('does not expose Ki-Buddy authentication in the ordinary AionUi desktop runtime', async () => {
    await import('@/preload/main');

    const electronApiCall = exposeInMainWorld.mock.calls.find(([key]) => key === 'electronAPI');
    const electronApi = electronApiCall?.[1] as { kiBuddyAuth?: unknown; kiBuddyCoreTransport?: unknown } | undefined;

    expect(electronApi?.kiBuddyAuth).toBeUndefined();
    expect(electronApi?.kiBuddyCoreTransport).toBeUndefined();
    expect(sendSync).not.toHaveBeenCalledWith('ki-buddy:core-transport:get-csrf-token');
  });
});
