import { describe, expect, it } from 'vitest';
import { normalizeKiBuddyLoginErrorCode } from '@/renderer/pages/ki-buddy/loginErrors';

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
});
