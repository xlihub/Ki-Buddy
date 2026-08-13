import { DEFAULT_LANGUAGE, normalizeLanguageCode, type SupportedLanguage } from '@/common/config/i18n';
import { KI_BUDDY_PRODUCT_CONFIG } from './productConfig';

type LanguagePreferenceInput = {
  fallbackLanguage?: string | null;
  productLanguage?: string | null;
  savedLanguage?: string | null;
  systemLanguage?: string | null;
};

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export const KI_BUDDY_DEFAULT_AGENTS_BASE_URL = KI_BUDDY_PRODUCT_CONFIG.defaults.agentsBaseUrl;
export const KI_BUDDY_DEFAULT_LANGUAGE = KI_BUDDY_PRODUCT_CONFIG.defaults.language;

/** Resolves saved → product → system → global fallback using one rule for every startup phase. */
export function resolveLanguagePreference(input: LanguagePreferenceInput): SupportedLanguage {
  const language =
    nonEmpty(input.savedLanguage) ??
    nonEmpty(input.productLanguage) ??
    nonEmpty(input.systemLanguage) ??
    nonEmpty(input.fallbackLanguage) ??
    DEFAULT_LANGUAGE;
  return normalizeLanguageCode(language);
}
