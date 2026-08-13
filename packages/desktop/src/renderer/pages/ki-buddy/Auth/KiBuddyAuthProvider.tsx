import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from '@/renderer/hooks/context/AuthContext';
import type { KiBuddyAgentsProfile } from '@/common/types/platform/kiBuddyAuth';
import {
  createKiBuddyAuthAdapter,
  type KiBuddyAuthAdapter,
  type KiBuddyLoginParams,
  type KiBuddyRendererLoginResult,
} from './kiBuddyAuthAdapter';

type KiBuddyAccountSwitchBarrier = {
  observe: (userId: string | null) => void;
};

/** Remembers the last active Core user and reloads when a different account becomes active. */
export function createKiBuddyAccountSwitchBarrier(reload: () => void): KiBuddyAccountSwitchBarrier {
  let previousUserId: string | null = null;
  let reloadRequested = false;

  return {
    observe: (userId) => {
      if (!userId || reloadRequested) return;
      if (previousUserId && previousUserId !== userId) {
        reloadRequested = true;
        reload();
        return;
      }
      previousUserId = userId;
    },
  };
}

type KiBuddyAuthContextValue = {
  login: (params: KiBuddyLoginParams) => Promise<KiBuddyRendererLoginResult>;
  profile: KiBuddyAgentsProfile | null;
};

const KiBuddyAuthContext = createContext<KiBuddyAuthContextValue | undefined>(undefined);

const KiBuddyAuthContextBridge: React.FC<
  React.PropsWithChildren<{ adapter: KiBuddyAuthAdapter; profile: KiBuddyAgentsProfile | null }>
> = ({ adapter, children, profile }) => {
  const { login: authenticate, refresh, user } = useAuth();
  const accountSwitchBarrier = useMemo(() => createKiBuddyAccountSwitchBarrier(() => window.location.reload()), []);
  const login = useCallback(
    (params: KiBuddyLoginParams) => adapter.login(params, authenticate),
    [adapter, authenticate]
  );
  const value = useMemo(() => ({ login, profile }), [login, profile]);

  useEffect(() => accountSwitchBarrier.observe(user?.id ?? null), [accountSwitchBarrier, user?.id]);
  useEffect(() => adapter.subscribeToSessionInvalidation(() => void refresh()), [adapter, refresh]);

  return <KiBuddyAuthContext.Provider value={value}>{children}</KiBuddyAuthContext.Provider>;
};

/** Owns Ki-Buddy-only authentication state while delegating common session state to AuthContext. */
export const KiBuddyAuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [profile, setProfile] = useState<KiBuddyAgentsProfile | null>(null);
  const adapter = useMemo(() => createKiBuddyAuthAdapter({ setProfile }), []);

  return (
    <AuthProvider handlerFactory={adapter.handlerFactory}>
      <KiBuddyAuthContextBridge adapter={adapter} profile={profile}>
        {children}
      </KiBuddyAuthContextBridge>
    </AuthProvider>
  );
};

/** Returns Ki-Buddy-only login and Agents profile state from the product provider. */
export function useKiBuddyAuth(): KiBuddyAuthContextValue {
  const context = useContext(KiBuddyAuthContext);
  if (!context) throw new Error('useKiBuddyAuth must be used within KiBuddyAuthProvider');
  return context;
}
