import { beforeEach, describe, expect, it } from 'vitest';
import { getKiBuddyAccountSettingsItem } from '@/renderer/pages/ki-buddy';

const translateKey = (key: string) => key;

describe('Ki-Buddy settings navigation', () => {
  const kiBuddyAuth = {
    getSession: async () => ({ status: 'unauthenticated' as const, user: null }),
    login: async () => ({ success: false as const, code: 'networkError' as const }),
    logout: async () => ({ status: 'unauthenticated' as const, user: null }),
  };

  beforeEach(() => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth };
  });

  it('adds the account entry only when the Ki-Buddy capability is present', () => {
    expect(getKiBuddyAccountSettingsItem(translateKey)).toMatchObject({ id: 'account', path: 'account' });

    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };
    expect(getKiBuddyAccountSettingsItem(translateKey)).toBeNull();
  });
});
