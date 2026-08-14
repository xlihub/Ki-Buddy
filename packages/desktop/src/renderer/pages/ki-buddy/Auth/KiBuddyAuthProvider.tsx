import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from '@/renderer/hooks/context/AuthContext';
import type { KiBuddyAgentsProfile } from '@/common/types/platform/kiBuddyAuth';
import {
  createKiBuddyAuthAdapter,
  type KiBuddyAuthAdapter,
  type KiBuddyLoginParams,
  type KiBuddyRendererLoginResult,
} from './kiBuddyAuthAdapter';

type KiBuddyAccountSwitchBarrier = {
  recordCommittedUser: (userId: string | null) => void;
  requestReload: () => void;
  shouldBlock: (userId: string | null) => boolean;
};

/** Remembers the last active Core user and blocks a different account until the renderer reloads. */
export function createKiBuddyAccountSwitchBarrier(reload: () => void): KiBuddyAccountSwitchBarrier {
  let previousUserId: string | null = null;
  let reloadRequested = false;

  return {
    recordCommittedUser: (userId) => {
      if (userId) previousUserId = userId;
    },
    requestReload: () => {
      if (!reloadRequested) {
        reloadRequested = true;
        reload();
      }
    },
    shouldBlock: (userId) => {
      if (!userId) return false;
      return Boolean(previousUserId && previousUserId !== userId);
    },
  };
}

type KiBuddyAuthContextValue = {
  login: (params: KiBuddyLoginParams) => Promise<KiBuddyRendererLoginResult>;
  profile: KiBuddyAgentsProfile | null;
};

const KiBuddyAuthContext = createContext<KiBuddyAuthContextValue | undefined>(undefined);

function reloadRenderer(): void {
  window.location.reload();
}

const KiBuddyAuthContextBridge: React.FC<
  React.PropsWithChildren<{
    adapter: KiBuddyAuthAdapter;
    profile: KiBuddyAgentsProfile | null;
    reload: () => void;
  }>
> = ({ adapter, children, profile, reload }) => {
  const { login: authenticate, refresh, user } = useAuth();
  const accountSwitchBarrier = useMemo(() => createKiBuddyAccountSwitchBarrier(reload), [reload]);
  const login = useCallback(
    (params: KiBuddyLoginParams) => adapter.login(params, authenticate),
    [adapter, authenticate]
  );
  const value = useMemo(() => ({ login, profile }), [login, profile]);
  const accountSwitchBlocked = accountSwitchBarrier.shouldBlock(user?.id ?? null);

  useLayoutEffect(() => {
    if (accountSwitchBlocked) {
      accountSwitchBarrier.requestReload();
      return;
    }
    accountSwitchBarrier.recordCommittedUser(user?.id ?? null);
  }, [accountSwitchBarrier, accountSwitchBlocked, user?.id]);
  useEffect(() => adapter.subscribeToSessionInvalidation(() => void refresh()), [adapter, refresh]);

  if (accountSwitchBlocked) return null;
  return <KiBuddyAuthContext.Provider value={value}>{children}</KiBuddyAuthContext.Provider>;
};

/** Owns Ki-Buddy-only authentication state while delegating common session state to AuthContext. */
export const KiBuddyAuthProvider: React.FC<React.PropsWithChildren<{ reload?: () => void }>> = ({
  children,
  reload = reloadRenderer,
}) => {
  const [profile, setProfile] = useState<KiBuddyAgentsProfile | null>(null);
  const adapter = useMemo(() => createKiBuddyAuthAdapter({ setProfile }), []);

  return (
    <AuthProvider handlerFactory={adapter.handlerFactory}>
      <KiBuddyAuthContextBridge adapter={adapter} profile={profile} reload={reload}>
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
