export type KiBuddyAuthUser = {
  id: string;
  username: string;
};

export type KiBuddyAuthSession =
  | { status: 'authenticated'; user: KiBuddyAuthUser }
  | { status: 'unauthenticated'; user: null };

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
