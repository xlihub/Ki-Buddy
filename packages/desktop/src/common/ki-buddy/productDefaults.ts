import productConfig from '../../../../../ki-buddy-product.json';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  normalizeLanguageCode,
  type SupportedLanguage,
} from '@/common/config/i18n';

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

function configuredProductLanguage(): SupportedLanguage | undefined {
  const language = (productConfig as { defaults?: { language?: unknown } }).defaults?.language;
  if (typeof language !== 'string' || !SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
    return undefined;
  }
  return language as SupportedLanguage;
}

export const KI_BUDDY_DEFAULT_LANGUAGE = configuredProductLanguage();

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
