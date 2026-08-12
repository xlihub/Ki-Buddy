import type { KiBuddyLoginResult } from '@/common/types/platform/kiBuddyAuth';
import type { I18nKey } from '@/renderer/services/i18n';

export type KiBuddyLoginErrorCode = Extract<KiBuddyLoginResult, { success: false }>['code'] | 'unknown';

export const KI_BUDDY_LOGIN_ERROR_KEYS: Record<KiBuddyLoginErrorCode, I18nKey> = {
  contractError: 'login.errors.contractError',
  invalidCredentials: 'login.errors.invalidCredentials',
  networkError: 'login.errors.networkError',
  serverError: 'login.errors.serverError',
  unknown: 'login.errors.unknown',
};

/** Normalizes errors crossing the generic AuthContext boundary into Ki-Buddy's product codes. */
export function normalizeKiBuddyLoginErrorCode(code: string | undefined): KiBuddyLoginErrorCode {
  return code && code in KI_BUDDY_LOGIN_ERROR_KEYS ? (code as KiBuddyLoginErrorCode) : 'unknown';
}
