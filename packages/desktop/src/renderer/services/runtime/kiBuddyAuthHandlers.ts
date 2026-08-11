import type { AuthStatus, AuthUser, LoginParams, LoginResult } from '@/renderer/hooks/context/AuthContext';
import { getKiBuddyAuthApi } from '@/renderer/utils/platform';

type KiBuddyAuthHandlersOptions = {
  clearAccountState: () => void;
  setReady: (ready: boolean) => void;
  setStatus: (status: AuthStatus) => void;
  setUser: (user: AuthUser | null) => void;
};

export type AuthHandlers = {
  login: (params: LoginParams) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

/** Creates the renderer handlers for Ki-Buddy's main-process owned authentication. */
export function createKiBuddyAuthHandlers(options: KiBuddyAuthHandlersOptions): AuthHandlers | null {
  const api = getKiBuddyAuthApi();
  if (!api) return null;

  return {
    refresh: async () => {
      options.setStatus('checking');
      try {
        const session = await api.getSession();
        if (session.status === 'unauthenticated' && session.cleanupRequired) {
          options.clearAccountState();
        }
        options.setUser(session.user);
        options.setStatus(session.status);
      } catch (error) {
        console.error('Failed to restore Ki-Buddy session:', error);
        options.setUser(null);
        options.setStatus('unauthenticated');
      } finally {
        options.setReady(true);
      }
    },
    login: async ({ baseUrl, username, password }) => {
      try {
        const result = await api.login({
          baseUrl: baseUrl ?? '',
          loginName: username,
          password,
        });
        if ('code' in result) return { success: false, code: result.code };

        options.clearAccountState();
        options.setUser(result.session.user);
        options.setStatus('authenticated');
        options.setReady(true);
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
        options.clearAccountState();
        options.setUser(null);
        options.setStatus('unauthenticated');
        options.setReady(true);
      }
    },
  };
}
