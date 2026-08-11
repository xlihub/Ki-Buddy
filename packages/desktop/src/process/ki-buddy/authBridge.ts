import { app, ipcMain, session } from 'electron';
import { KI_BUDDY_AUTH_CHANNELS } from '@/common/platform/kiBuddyAuth';
import type { KiBuddyLoginRequest, KiBuddyLoginResult } from '@/common/types/platform/kiBuddyAuth';
import { AgentsAuthService } from './AgentsAuthService';
import { SafeStorageCredentialStore } from './CredentialStore';

type RegisterKiBuddyAuthOptions = {
  bootstrapSecret: string;
  coreCsrfToken: string;
  getCoreBaseUrl: () => string;
};

const CORE_SESSION_COOKIE = 'aionui-session';
const CORE_CSRF_COOKIE = 'aionui-csrf-token';

function isLoginRequest(value: unknown): value is KiBuddyLoginRequest {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.baseUrl === 'string' && typeof record.loginName === 'string' && typeof record.password === 'string'
  );
}

async function setCoreSessionCookie(coreBaseUrl: string, csrfToken: string, header: string): Promise<void> {
  const [nameValue, ...attributes] = header.split(';').map((part) => part.trim());
  const separator = nameValue.indexOf('=');
  if (separator <= 0) throw new Error('Core returned an invalid session cookie');
  const name = nameValue.slice(0, separator);
  if (name !== CORE_SESSION_COOKIE) throw new Error('Core returned an unexpected session cookie');
  const value = decodeURIComponent(nameValue.slice(separator + 1));
  const maxAge = attributes
    .map((attribute) => /^Max-Age=(\d+)$/i.exec(attribute))
    .find((match): match is RegExpExecArray => match !== null);

  const cookieWrites = [
    session.defaultSession.cookies.set({
      url: coreBaseUrl,
      name,
      value,
      path: '/',
      httpOnly: true,
      sameSite: 'no_restriction',
      secure: true,
      ...(maxAge ? { expirationDate: Date.now() / 1000 + Number(maxAge[1]) } : {}),
    }),
    session.defaultSession.cookies.set({
      url: coreBaseUrl,
      name: CORE_CSRF_COOKIE,
      value: csrfToken,
      path: '/',
      httpOnly: false,
      sameSite: 'no_restriction',
      secure: true,
    }),
  ];
  try {
    await Promise.all(cookieWrites);
  } catch (error) {
    await Promise.allSettled(cookieWrites);
    await clearCoreSession(coreBaseUrl);
    throw error;
  }
  (globalThis as typeof globalThis & { __coreAccessToken?: string }).__coreAccessToken = value;
}

async function clearCoreSession(coreBaseUrl: string): Promise<void> {
  delete (globalThis as typeof globalThis & { __coreAccessToken?: string }).__coreAccessToken;
  await Promise.allSettled([
    session.defaultSession.cookies.remove(coreBaseUrl, CORE_SESSION_COOKIE),
    session.defaultSession.cookies.remove(coreBaseUrl, CORE_CSRF_COOKIE),
  ]);
}

export function registerKiBuddyAuthBridge(options: RegisterKiBuddyAuthOptions): AgentsAuthService {
  (globalThis as typeof globalThis & { __coreCsrfToken?: string }).__coreCsrfToken = options.coreCsrfToken;
  const service = new AgentsAuthService({
    bootstrapSecret: options.bootstrapSecret,
    credentialStore: new SafeStorageCredentialStore(app.getPath('userData')),
    fetch,
    getCoreBaseUrl: options.getCoreBaseUrl,
    setCoreSessionCookie: (header) => setCoreSessionCookie(options.getCoreBaseUrl(), options.coreCsrfToken, header),
  });

  ipcMain.handle(KI_BUDDY_AUTH_CHANNELS.getSession, () => service.getSession());
  ipcMain.handle(KI_BUDDY_AUTH_CHANNELS.login, (_event, request: unknown): Promise<KiBuddyLoginResult> => {
    if (!isLoginRequest(request)) {
      return Promise.resolve({ success: false, code: 'contractError' });
    }
    return service.login(request);
  });
  ipcMain.handle(KI_BUDDY_AUTH_CHANNELS.logout, () =>
    service.logout({ clearCoreSessionCookie: () => clearCoreSession(options.getCoreBaseUrl()) })
  );
  return service;
}
