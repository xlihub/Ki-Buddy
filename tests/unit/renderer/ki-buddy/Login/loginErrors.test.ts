import { describe, expect, it } from 'vitest';
import { KI_BUDDY_LOGIN_ERROR_KEYS, normalizeKiBuddyLoginErrorCode } from '@/renderer/pages/ki-buddy/Login/loginErrors';

describe('Ki-Buddy login error normalization', () => {
  it.each(['contractError', 'invalidCredentials', 'networkError', 'serverError'])(
    'preserves known product error %s',
    (code) => {
      expect(normalizeKiBuddyLoginErrorCode(code)).toBe(code);
    }
  );

  it.each([undefined, 'unexpectedError'])('maps missing or unknown error %s to unknown', (code) => {
    expect(normalizeKiBuddyLoginErrorCode(code)).toBe('unknown');
  });

  it('keeps product server errors separate from the public AionUi login copy', () => {
    expect(KI_BUDDY_LOGIN_ERROR_KEYS.serverError).toBe('login.kiBuddy.errors.serverError');
  });
});
