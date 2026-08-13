import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { normalizeAgentsBaseUrl } from '@/common/platform/ki-buddy';
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

type AgentsAccountIdentity = {
  baseUrl: string;
  userId: string;
};

export type AgentsCredentialStore = {
  load: () => Promise<StoredAgentsSession | null>;
  save: (session: StoredAgentsSession) => Promise<void>;
  clear: () => Promise<void>;
};

type AgentsAuthServiceDependencies = {
  agentsFetch: typeof fetch;
  bootstrapSecret: string;
  clearCoreSession: () => Promise<void>;
  credentialStore: AgentsCredentialStore;
  fetch: typeof fetch;
  getCoreBaseUrl: () => string;
  onSessionInvalidated?: () => void;
  scheduleSessionValidation?: (validate: () => Promise<void>) => () => void;
  setCoreSessionCookie: (setCookieHeader: string) => Promise<void>;
};

type AgentsSessionReference = AgentsAccountIdentity & {
  generation: number;
};

type AgentsIdentity = {
  email?: string;
  name?: string;
  organization?: string;
  phone?: string;
  roles: string[];
  userId: string;
  username: string;
};

type AgentsLoginBody = AgentsIdentity & { token: string };
type AuthenticatedKiBuddySession = Extract<KiBuddyAuthSession, { status: 'authenticated' }>;

type CoreSessionProjection = {
  setCookieHeader: string;
  user: KiBuddyAuthUser;
};

type CoreUser = Pick<KiBuddyAuthUser, 'id' | 'username'>;

type CoreProjectionResult =
  | { success: true; projection: CoreSessionProjection }
  | { success: false; code: 'networkError' | 'serverError' | 'contractError' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseRoleNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((role) => {
    if (typeof role === 'string') {
      const name = optionalString(role);
      return name ? [name] : [];
    }
    if (!isRecord(role)) return [];
    const name = optionalString(role.name);
    return name ? [name] : [];
  });
}

function externalIdentity(identity: AgentsAccountIdentity): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([identity.baseUrl, identity.userId]), 'utf8')
    .digest('base64url');
  return `agents-v1-${digest}`;
}

async function hashLoginPassword(rawPassword: string): Promise<string> {
  const digest = createHash('md5').update(rawPassword, 'utf8').digest('hex');
  return bcrypt.hash(digest, 11);
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
    email: optionalString(responseBody.email),
    name: optionalString(responseBody.name),
    organization: optionalString(responseBody.orgName),
    phone: optionalString(responseBody.phone),
    roles: parseRoleNames(responseBody.roles),
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

function parseCoreUser(body: unknown): CoreUser | null {
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

function isCoreRevokeResponse(body: unknown): boolean {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) return false;
  return typeof body.data.user_id === 'string' && typeof body.data.session_generation === 'number';
}

/** Owns the Ki-Buddy Agents session and its projected Core user session. */
export class AgentsAuthService {
  private activeCredential: StoredAgentsSession | null = null;
  private activeIdentity: AgentsAccountIdentity | null = null;
  private session: KiBuddyAuthSession = { status: 'unauthenticated', user: null };
  private sessionAbortController: AbortController | null = null;
  private restoreAttempted = false;
  private sessionGeneration = 0;
  private sessionValidationPendingGeneration: number | null = null;
  private stopSessionValidation: (() => void) | null = null;

  /** Creates the service with explicit network, credential, and Core-session dependencies. */
  constructor(private readonly dependencies: AgentsAuthServiceDependencies) {}

  /** Restores a saved Agents token and projects its verified identity into Core. */
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
      response = await this.dependencies.agentsFetch(`${stored.baseUrl}/kagent/system/user/validateToken`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${stored.token}` },
        redirect: 'manual',
      });
    } catch {
      return this.session;
    }

    if (response.status === 401 || response.status === 403) {
      await this.deactivateIdentity({ baseUrl: stored.baseUrl, userId: stored.userId });
      this.session = { status: 'unauthenticated', user: null, cleanupRequired: true };
      return this.session;
    }
    if (!response.ok) {
      return this.session;
    }

    const identity = parseAgentsIdentity(await readJson(response));
    if (!identity || identity.userId !== stored.userId) {
      await this.deactivateIdentity({ baseUrl: stored.baseUrl, userId: stored.userId });
      this.session = { status: 'unauthenticated', user: null, cleanupRequired: true };
      return this.session;
    }

    const coreProjection = await this.establishCoreSession(stored.baseUrl, identity);
    if (coreProjection.success) {
      try {
        await this.activateSession(stored, coreProjection.projection);
      } catch {
        await this.deactivateIdentity({ baseUrl: stored.baseUrl, userId: stored.userId });
        this.session = { status: 'unauthenticated', user: null, cleanupRequired: true };
        return this.session;
      }
    }
    return this.session;
  }

  /** Authenticates with Agents and activates the matching isolated Core user. */
  async login(request: KiBuddyLoginRequest): Promise<KiBuddyLoginResult> {
    const baseUrl = normalizeAgentsBaseUrl(request.baseUrl);
    if (!baseUrl) return { success: false, code: 'contractError' };

    let agentsResponse: Response;
    try {
      const form = new FormData();
      form.append('username', request.loginName.trim());
      form.append('password', await hashLoginPassword(request.password));
      agentsResponse = await this.dependencies.agentsFetch(`${baseUrl}/kagent/login`, {
        method: 'POST',
        body: form,
        redirect: 'manual',
      });
    } catch {
      return { success: false, code: 'networkError' };
    }

    const agentsEnvelope = await readJson(agentsResponse);
    const authRejected =
      isRecord(agentsEnvelope) &&
      typeof agentsEnvelope.errorCode === 'number' &&
      agentsEnvelope.errorCode !== 0 &&
      agentsResponse.status < 500;
    if (agentsResponse.status === 401 || agentsResponse.status === 403 || authRejected) {
      return { success: false, code: 'invalidCredentials' };
    }
    if (!agentsResponse.ok) {
      return { success: false, code: agentsResponse.status >= 500 ? 'serverError' : 'contractError' };
    }
    const agentsUser = parseAgentsLogin(agentsEnvelope);
    if (!agentsUser) {
      return { success: false, code: 'contractError' };
    }

    const nextIdentity = { baseUrl, userId: agentsUser.userId };
    const existingIdentity = await this.resolveExistingIdentity();
    let previousIdentityDeactivated = false;
    if (existingIdentity && !this.isSameIdentity(existingIdentity, nextIdentity)) {
      const cleanupError = await this.deactivateIdentity(existingIdentity);
      previousIdentityDeactivated = true;
      if (cleanupError) return { success: false, code: 'serverError', shouldClearCache: true };
    }

    const coreProjection = await this.establishCoreSession(baseUrl, agentsUser);
    if ('code' in coreProjection) {
      return {
        success: false,
        code: coreProjection.code,
        ...(previousIdentityDeactivated ? { shouldClearCache: true as const } : {}),
      };
    }

    try {
      await this.dependencies.credentialStore.save({
        baseUrl,
        token: agentsUser.token,
        userId: agentsUser.userId,
      });
    } catch {
      await this.deactivateIdentity(nextIdentity);
      return { success: false, code: 'serverError', shouldClearCache: true };
    }

    try {
      const session = await this.activateSession(
        { baseUrl, token: agentsUser.token, userId: agentsUser.userId },
        coreProjection.projection
      );
      return { success: true, session };
    } catch {
      await this.deactivateIdentity(nextIdentity);
      return { success: false, code: 'serverError', shouldClearCache: true };
    }
  }

  /** Revokes the Core projection and removes all locally stored session credentials. */
  async logout(): Promise<KiBuddyAuthSession> {
    const identity = await this.resolveExistingIdentity();
    const credentialCleanupError = await this.deactivateIdentity(identity);
    if (credentialCleanupError) throw credentialCleanupError;
    return this.session;
  }

  /** Sends an authenticated request only to the active Agents deployment. */
  async fetchAuthenticated(path: string, init: RequestInit = {}): Promise<Response> {
    const credential = this.activeCredential;
    const generation = this.sessionGeneration;
    if (!credential) throw new Error('No active Agents session');
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('Authenticated Agents requests require a deployment-relative path');
    }

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${credential.token}`);
    const sessionSignal = this.sessionAbortController?.signal;
    const signal =
      init.signal && sessionSignal ? AbortSignal.any([init.signal, sessionSignal]) : (sessionSignal ?? init.signal);
    const response = await this.dependencies.agentsFetch(`${credential.baseUrl}${path}`, {
      ...init,
      headers,
      redirect: 'manual',
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      await this.invalidateSessionIfCurrent({
        baseUrl: credential.baseUrl,
        generation,
        userId: credential.userId,
      });
    }
    return response;
  }

  /** Ends the active local session when a bound Agents request reports authentication loss. */
  private async invalidateSessionIfCurrent(reference: AgentsSessionReference): Promise<boolean> {
    const baseUrl = normalizeAgentsBaseUrl(reference.baseUrl);
    const activeIdentity = this.activeIdentity;
    if (
      reference.generation !== this.sessionGeneration ||
      !baseUrl ||
      !activeIdentity ||
      !this.isSameIdentity(activeIdentity, { baseUrl, userId: reference.userId })
    ) {
      return false;
    }

    const cleanupError = await this.deactivateIdentity(activeIdentity);
    this.session = { status: 'unauthenticated', user: null, cleanupRequired: true };
    this.dependencies.onSessionInvalidated?.();
    if (cleanupError) throw cleanupError;
    return true;
  }

  private isSameIdentity(left: AgentsAccountIdentity, right: AgentsAccountIdentity): boolean {
    return left.baseUrl === right.baseUrl && left.userId === right.userId;
  }

  private async activateSession(
    credential: StoredAgentsSession,
    projection: CoreSessionProjection
  ): Promise<AuthenticatedKiBuddySession> {
    await this.dependencies.setCoreSessionCookie(projection.setCookieHeader);
    this.sessionGeneration += 1;
    this.sessionAbortController = new AbortController();
    this.activeCredential = credential;
    this.activeIdentity = { baseUrl: credential.baseUrl, userId: credential.userId };
    const session: AuthenticatedKiBuddySession = { status: 'authenticated', user: projection.user };
    this.session = session;
    this.restoreAttempted = true;
    this.startSessionValidation();
    return session;
  }

  private startSessionValidation(): void {
    this.stopSessionValidation?.();
    this.stopSessionValidation =
      this.dependencies.scheduleSessionValidation?.(async () => {
        if (this.sessionValidationPendingGeneration !== null) return;
        const credential = this.activeCredential;
        if (!credential) return;
        const generation = this.sessionGeneration;
        this.sessionValidationPendingGeneration = generation;
        try {
          const response = await this.fetchAuthenticated('/kagent/system/user/validateToken', { method: 'POST' });
          if (!response.ok) return;
          const identity = parseAgentsIdentity(await readJson(response));
          if (!identity || identity.userId !== credential.userId) {
            await this.invalidateSessionIfCurrent({
              baseUrl: credential.baseUrl,
              generation,
              userId: credential.userId,
            });
          }
        } finally {
          if (this.sessionValidationPendingGeneration === generation) {
            this.sessionValidationPendingGeneration = null;
          }
        }
      }) ?? null;
  }

  private async resolveExistingIdentity(): Promise<AgentsAccountIdentity | null> {
    if (this.activeIdentity) return this.activeIdentity;
    try {
      const stored = await this.dependencies.credentialStore.load();
      return stored ? { baseUrl: stored.baseUrl, userId: stored.userId } : null;
    } catch {
      return null;
    }
  }

  private async revokeCoreProjection(identity: AgentsAccountIdentity): Promise<void> {
    const coreBaseUrl = this.dependencies.getCoreBaseUrl();
    const response = await this.dependencies.fetch(`${coreBaseUrl}/api/auth/internal/external-sessions/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-aioncore-bootstrap-secret': this.dependencies.bootstrapSecret,
      },
      body: JSON.stringify({
        user_type: 'aionpro',
        external_user_id: externalIdentity(identity),
      }),
    });
    if (!response.ok || !isCoreRevokeResponse(await readJson(response))) {
      throw new Error(`Core projection revocation failed with status ${response.status}`);
    }
  }

  private async deactivateIdentity(identity: AgentsAccountIdentity | null): Promise<unknown> {
    let cleanupError: unknown;
    this.sessionGeneration += 1;
    this.sessionAbortController?.abort();
    this.sessionAbortController = null;
    this.stopSessionValidation?.();
    this.stopSessionValidation = null;
    this.sessionValidationPendingGeneration = null;
    try {
      await this.dependencies.credentialStore.clear();
    } catch (error) {
      cleanupError = error;
    }
    if (identity) {
      try {
        await this.revokeCoreProjection(identity);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    this.activeCredential = null;
    this.activeIdentity = null;
    this.session = { status: 'unauthenticated', user: null };
    this.restoreAttempted = true;
    try {
      await this.dependencies.clearCoreSession();
    } catch (error) {
      cleanupError ??= error;
    }
    return cleanupError;
  }

  private async establishCoreSession(baseUrl: string, agentsUser: AgentsIdentity): Promise<CoreProjectionResult> {
    const identity = externalIdentity({ baseUrl, userId: agentsUser.userId });
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

    return {
      success: true,
      projection: {
        setCookieHeader: setCookie,
        user: {
          ...coreUser,
          agents: {
            userId: agentsUser.userId,
            username: agentsUser.username,
            displayName: agentsUser.name ?? agentsUser.username,
            email: agentsUser.email,
            phone: agentsUser.phone,
            organization: agentsUser.organization,
            roles: agentsUser.roles,
            deploymentUrl: baseUrl,
          },
        },
      },
    };
  }
}
