export type KiBuddyAgentsProfile = {
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  phone?: string;
  organization?: string;
  roles: string[];
  deploymentUrl: string;
};

export type KiBuddyAuthUser = {
  id: string;
  username: string;
  agents: KiBuddyAgentsProfile;
};

export type KiBuddyAuthSession =
  | { status: 'authenticated'; user: KiBuddyAuthUser }
  | { status: 'unauthenticated'; user: null; cleanupRequired?: true };

export type KiBuddyLoginRequest = {
  baseUrl: string;
  loginName: string;
  password: string;
};

export type KiBuddyLoginResult =
  | { success: true; session: Extract<KiBuddyAuthSession, { status: 'authenticated' }> }
  | { success: false; code: 'invalidCredentials' | 'networkError' | 'serverError' | 'contractError' };

export type KiBuddyAuthApi = {
  getSession: () => Promise<KiBuddyAuthSession>;
  login: (request: KiBuddyLoginRequest) => Promise<KiBuddyLoginResult>;
  logout: () => Promise<KiBuddyAuthSession>;
};
