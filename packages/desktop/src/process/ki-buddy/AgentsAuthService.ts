import { createHash } from 'node:crypto';
import type {
  KiBuddyAuthSession,
  KiBuddyAuthUser,
  KiBuddyLoginRequest,
  KiBuddyLoginResult,
} from '@/common/types/platform/kiBuddyAuth';

export type StoredAgentsSession = {
  baseUrl: string;
  token: string;
  userId: string;
};

export type AgentsCredentialStore = {
  load: () => Promise<StoredAgentsSession | null>;
  save: (session: StoredAgentsSession) => Promise<void>;
  clear: () => Promise<void>;
};

type AgentsAuthServiceDependencies = {
  bootstrapSecret: string;
  credentialStore: AgentsCredentialStore;
  fetch: typeof fetch;
  getCoreBaseUrl: () => string;
  setCoreSessionCookie: (setCookieHeader: string) => Promise<void>;
};

type AgentsIdentity = {
  email?: string;
  userId: string;
  username: string;
};

type AgentsLoginBody = AgentsIdentity & { token: string };

type CoreSessionProjection = {
  setCookieHeader: string;
  user: KiBuddyAuthUser;
};

type CoreProjectionResult =
  | { success: true; projection: CoreSessionProjection }
  | { success: false; code: 'networkError' | 'serverError' | 'contractError' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('unsupported protocol');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('base URL must not contain credentials, query, or fragment');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function externalIdentity(baseUrl: string, userId: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([baseUrl, userId]), 'utf8')
    .digest('base64url');
  return `agents-v1-${digest}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseAgentsIdentity(body: unknown): AgentsIdentity | null {
  if (!isRecord(body) || body.errorCode !== 0 || !isRecord(body.responseBody)) {
    return null;
  }
  const responseBody = body.responseBody;
  if (
    typeof responseBody.uuid !== 'string' ||
    responseBody.uuid.length === 0 ||
    typeof responseBody.userName !== 'string' ||
    responseBody.userName.length === 0
  ) {
    return null;
  }
  return {
    email: typeof responseBody.email === 'string' ? responseBody.email : undefined,
    userId: responseBody.uuid,
    username: responseBody.userName,
  };
}

function parseAgentsLogin(body: unknown): AgentsLoginBody | null {
  const identity = parseAgentsIdentity(body);
  const responseBody = isRecord(body) && isRecord(body.responseBody) ? body.responseBody : null;
  if (!identity || !responseBody || typeof responseBody.token !== 'string' || responseBody.token.length === 0) {
    return null;
  }
  return { ...identity, token: responseBody.token };
}

function parseCoreUser(body: unknown): KiBuddyAuthUser | null {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data) || !isRecord(body.data.user)) {
    return null;
  }
  const user = body.data.user;
  if (typeof user.id !== 'string' || typeof user.username !== 'string') {
    return null;
  }
  return { id: user.id, username: user.username };
}

function isCoreProvisionResponse(body: unknown): boolean {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) return false;
  const data = body.data;
  return (
    typeof data.user_id === 'string' &&
    data.user_type === 'aionpro' &&
    typeof data.external_user_id === 'string' &&
    typeof data.session_generation === 'number'
  );
}

export class AgentsAuthService {
  private activeIdentity: Pick<StoredAgentsSession, 'baseUrl' | 'userId'> | null = null;
  private session: KiBuddyAuthSession = { status: 'unauthenticated', user: null };
  private restoreAttempted = false;

  constructor(private readonly dependencies: AgentsAuthServiceDependencies) {}

  async getSession(): Promise<KiBuddyAuthSession> {
    if (this.session.status === 'authenticated' || this.restoreAttempted) {
      return this.session;
    }
    this.restoreAttempted = true;

    let stored: StoredAgentsSession | null;
    try {
      stored = await this.dependencies.credentialStore.load();
    } catch {
      return this.session;
    }
    if (!stored) {
      return this.session;
    }

    let response: Response;
    try {
      response = await this.dependencies.fetch(`${stored.baseUrl}/api/auth/token/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${stored.token}` },
        redirect: 'manual',
      });
    } catch {
      return this.session;
    }

    if (response.status === 401 || response.status === 403) {
      await this.dependencies.credentialStore.clear();
      return this.session;
    }
    if (!response.ok) {
      return this.session;
    }

    const identity = parseAgentsIdentity(await readJson(response));
    if (!identity || identity.userId !== stored.userId) {
      await this.dependencies.credentialStore.clear();
      return this.session;
    }

    const coreProjection = await this.establishCoreSession(stored.baseUrl, identity);
    if (coreProjection.success) {
      try {
        await this.dependencies.setCoreSessionCookie(coreProjection.projection.setCookieHeader);
        this.activeIdentity = { baseUrl: stored.baseUrl, userId: stored.userId };
        this.session = { status: 'authenticated', user: coreProjection.projection.user };
      } catch {
        return this.session;
      }
    }
    return this.session;
  }

  async login(request: KiBuddyLoginRequest): Promise<KiBuddyLoginResult> {
    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(request.baseUrl);
    } catch {
      return { success: false, code: 'contractError' };
    }

    let agentsResponse: Response;
    try {
      agentsResponse = await this.dependencies.fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginName: request.loginName, password: request.password }),
        redirect: 'manual',
      });
    } catch {
      return { success: false, code: 'networkError' };
    }

    const agentsEnvelope = await readJson(agentsResponse);
    if (
      agentsResponse.status === 401 ||
      agentsResponse.status === 403 ||
      (isRecord(agentsEnvelope) && agentsEnvelope.errorCode === 40001)
    ) {
      return { success: false, code: 'invalidCredentials' };
    }
    if (!agentsResponse.ok) {
      return { success: false, code: agentsResponse.status >= 500 ? 'serverError' : 'contractError' };
    }

    const agentsUser = parseAgentsLogin(agentsEnvelope);
    if (!agentsUser) {
      return { success: false, code: 'contractError' };
    }

    const coreProjection = await this.establishCoreSession(baseUrl, agentsUser);
    if ('code' in coreProjection) {
      return { success: false, code: coreProjection.code };
    }

    try {
      await this.dependencies.credentialStore.save({
        baseUrl,
        token: agentsUser.token,
        userId: agentsUser.userId,
      });
    } catch {
      return { success: false, code: 'serverError' };
    }

    try {
      await this.dependencies.setCoreSessionCookie(coreProjection.projection.setCookieHeader);
      this.activeIdentity = { baseUrl, userId: agentsUser.userId };
      this.session = { status: 'authenticated', user: coreProjection.projection.user };
      this.restoreAttempted = true;
      return { success: true, session: this.session };
    } catch {
      await this.dependencies.credentialStore.clear();
      return { success: false, code: 'serverError' };
    }
  }

  async logout(options: { clearCoreSessionCookie: () => Promise<void> }): Promise<KiBuddyAuthSession> {
    let identity = this.activeIdentity;
    if (!identity) {
      try {
        const stored = await this.dependencies.credentialStore.load();
        identity = stored ? { baseUrl: stored.baseUrl, userId: stored.userId } : null;
      } catch {
        identity = null;
      }
    }

    await this.dependencies.credentialStore.clear();
    if (identity) {
      const coreBaseUrl = this.dependencies.getCoreBaseUrl();
      try {
        await this.dependencies.fetch(`${coreBaseUrl}/api/auth/internal/external-sessions/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-aioncore-bootstrap-secret': this.dependencies.bootstrapSecret,
          },
          body: JSON.stringify({
            user_type: 'aionpro',
            external_user_id: externalIdentity(identity.baseUrl, identity.userId),
          }),
        });
      } catch {
        // Core is local and its session cookie is cleared below even if revoke fails.
      }
    }

    this.activeIdentity = null;
    this.session = { status: 'unauthenticated', user: null };
    this.restoreAttempted = true;
    await options.clearCoreSessionCookie();
    return this.session;
  }

  private async establishCoreSession(baseUrl: string, agentsUser: AgentsIdentity): Promise<CoreProjectionResult> {
    const identity = externalIdentity(baseUrl, agentsUser.userId);
    const coreBaseUrl = this.dependencies.getCoreBaseUrl();
    const coreHeaders = {
      'Content-Type': 'application/json',
      'x-aioncore-bootstrap-secret': this.dependencies.bootstrapSecret,
    };

    let provisionResponse: Response;
    try {
      provisionResponse = await this.dependencies.fetch(
        `${coreBaseUrl}/api/auth/internal/external-users/${encodeURIComponent(identity)}`,
        {
          method: 'PUT',
          headers: coreHeaders,
          body: JSON.stringify({
            user_type: 'aionpro',
            username: agentsUser.username,
            email: agentsUser.email,
            avatar_path: null,
          }),
        }
      );
    } catch {
      return { success: false, code: 'networkError' };
    }
    if (!provisionResponse.ok) {
      return { success: false, code: provisionResponse.status >= 500 ? 'serverError' : 'contractError' };
    }
    if (!isCoreProvisionResponse(await readJson(provisionResponse))) {
      return { success: false, code: 'contractError' };
    }

    let coreSessionResponse: Response;
    try {
      coreSessionResponse = await this.dependencies.fetch(`${coreBaseUrl}/api/auth/internal/external-sessions`, {
        method: 'POST',
        headers: coreHeaders,
        body: JSON.stringify({ user_type: 'aionpro', external_user_id: identity }),
      });
    } catch {
      return { success: false, code: 'networkError' };
    }
    if (!coreSessionResponse.ok) {
      return { success: false, code: coreSessionResponse.status >= 500 ? 'serverError' : 'contractError' };
    }
    const coreUser = parseCoreUser(await readJson(coreSessionResponse));
    const setCookie = coreSessionResponse.headers.get('set-cookie');
    if (!coreUser || !setCookie) {
      return { success: false, code: 'contractError' };
    }

    return { success: true, projection: { setCookieHeader: setCookie, user: coreUser } };
  }
}
