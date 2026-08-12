import type { AuthHandlerFactory, AuthHandlers, LoginResult } from '@/renderer/hooks/context/AuthContext';
import { getKiBuddyRendererRuntime } from '@/renderer/services/runtime/kiBuddyRuntime';
import type { KiBuddyAgentsProfile } from '@/common/types/platform/kiBuddyAuth';
import { configService } from '@/common/config/configService';
import { normalizeKiBuddyLoginErrorCode, type KiBuddyLoginErrorCode } from '../loginErrors';

export type KiBuddyLoginParams = {
  baseUrl: string;
  username: string;
  password: string;
};

export type KiBuddyRendererLoginResult = LoginResult<KiBuddyLoginErrorCode>;

function toKiBuddyLoginResult(result: LoginResult<string>): KiBuddyRendererLoginResult {
  if (result.success) {
    return {
      success: true,
      ...(result.message ? { message: result.message } : {}),
      ...(result.shouldClearCache === undefined ? {} : { shouldClearCache: result.shouldClearCache }),
    };
  }
  return { ...result, code: normalizeKiBuddyLoginErrorCode(result.code) };
}

export type KiBuddyAuthAdapter = {
  handlerFactory: AuthHandlerFactory;
  login: (
    params: KiBuddyLoginParams,
    authenticate: AuthHandlers<string>['login']
  ) => Promise<KiBuddyRendererLoginResult>;
};

/** Creates the renderer adapter for Ki-Buddy's main-process owned authentication. */
export function createKiBuddyAuthAdapter(options: {
  setProfile: (profile: KiBuddyAgentsProfile | null) => void;
}): KiBuddyAuthAdapter {
  let pendingBaseUrl: string | null = null;

  return {
    login: async ({ baseUrl, username, password }, authenticate) => {
      pendingBaseUrl = baseUrl;
      try {
        return toKiBuddyLoginResult(await authenticate({ username, password }));
      } finally {
        pendingBaseUrl = null;
      }
    },
    handlerFactory: (state) => {
      const api = getKiBuddyRendererRuntime()?.authApi;
      if (!api) return null;
      const clearAccountState = () => {
        state.clearAccountState();
        configService.resetForAccountChange();
      };

      return {
        refresh: async () => {
          state.setStatus('checking');
          try {
            const session = await api.getSession();
            if (session.status === 'unauthenticated') {
              options.setProfile(null);
              if (session.cleanupRequired) clearAccountState();
            } else {
              options.setProfile(session.user.agents);
            }
            state.setUser(
              session.user
                ? {
                    id: session.user.id,
                    username: session.user.username,
                  }
                : null
            );
            state.setStatus(session.status);
          } catch (error) {
            console.error('Failed to restore Ki-Buddy session:', error);
            options.setProfile(null);
            state.setUser(null);
            state.setStatus('unauthenticated');
          } finally {
            state.setReady(true);
          }
        },
        login: async ({ username, password }) => {
          const baseUrl = pendingBaseUrl;
          if (baseUrl === null) return { success: false, code: 'contractError' };
          try {
            const result = await api.login({ baseUrl, loginName: username, password });
            if ('code' in result) {
              if (result.shouldClearCache) {
                clearAccountState();
                options.setProfile(null);
                state.setUser(null);
                state.setStatus('unauthenticated');
                state.setReady(true);
              }
              return {
                success: false,
                code: result.code,
                ...(result.shouldClearCache ? { shouldClearCache: true } : {}),
              };
            }

            clearAccountState();
            options.setProfile(result.session.user.agents);
            state.setUser({ id: result.session.user.id, username: result.session.user.username });
            state.setStatus('authenticated');
            state.setReady(true);
            return { success: true };
          } catch (error) {
            console.error('Ki-Buddy login request failed:', error);
            return { success: false, code: 'networkError' };
          }
        },
        logout: async () => {
          try {
            await api.logout();
          } catch (error) {
            console.error('Failed to clear Ki-Buddy main-process session:', error);
          } finally {
            clearAccountState();
            options.setProfile(null);
            state.setUser(null);
            state.setStatus('unauthenticated');
            state.setReady(true);
          }
        },
      };
    },
  };
}
