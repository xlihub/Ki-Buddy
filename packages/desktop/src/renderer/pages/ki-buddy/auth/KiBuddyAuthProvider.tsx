import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from '@/renderer/hooks/context/AuthContext';
import type { KiBuddyAgentsProfile } from '@/common/types/platform/kiBuddyAuth';
import {
  createKiBuddyAuthAdapter,
  type KiBuddyAuthAdapter,
  type KiBuddyLoginParams,
  type KiBuddyRendererLoginResult,
} from './kiBuddyAuthAdapter';

type KiBuddyAuthContextValue = {
  login: (params: KiBuddyLoginParams) => Promise<KiBuddyRendererLoginResult>;
  profile: KiBuddyAgentsProfile | null;
};

const KiBuddyAuthContext = createContext<KiBuddyAuthContextValue | undefined>(undefined);

const KiBuddyAuthContextBridge: React.FC<
  React.PropsWithChildren<{ adapter: KiBuddyAuthAdapter; profile: KiBuddyAgentsProfile | null }>
> = ({ adapter, children, profile }) => {
  const { login: authenticate } = useAuth();
  const login = useCallback(
    (params: KiBuddyLoginParams) => adapter.login(params, authenticate),
    [adapter, authenticate]
  );
  const value = useMemo(() => ({ login, profile }), [login, profile]);

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
