import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKiBuddyAccountSettingsItem } from '@/renderer/pages/ki-buddy/settingsNavigation';
import { getBuiltinSettingsNavItems } from '@/renderer/pages/settings/components/SettingsPageWrapper';

const translateKey = (key: string) => key;

describe('Ki-Buddy settings navigation', () => {
  beforeEach(() => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };
  });

  it('builds the account entry for the product runtime', () => {
    expect(createKiBuddyAccountSettingsItem(translateKey)).toMatchObject({ id: 'account', path: 'account' });
  });

  it('adds the product entry only when the Ki-Buddy capability is present', () => {
    expect(getBuiltinSettingsNavItems(true, translateKey).some(({ id }) => id === 'account')).toBe(false);
    window.electronAPI = {
      ...window.electronAPI,
      kiBuddyAuth: {
        getSession: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
      },
    };

    expect(getBuiltinSettingsNavItems(true, translateKey)[0]?.id).toBe('account');
  });
});
