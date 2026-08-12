import rawProductConfig from '../../../../../../ki-buddy-product.json';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/common/config/i18n';
import { normalizeAgentsBaseUrl } from './deploymentUrl';

export type KiBuddyProductConfig = {
  defaults: {
    agentsBaseUrl: string;
    language: SupportedLanguage;
  };
  runtimeIdentity: string;
  schemaVersion: 1;
};

/** Validates the runtime-owned subset of Ki-Buddy product configuration. */
export function parseKiBuddyProductConfig(value: unknown): KiBuddyProductConfig {
  if (typeof value !== 'object' || value === null) throw new Error('Ki-Buddy product configuration must be an object');
  const config = value as { defaults?: unknown; runtimeIdentity?: unknown; schemaVersion?: unknown };
  if (config.schemaVersion !== 1) throw new Error('Unsupported Ki-Buddy product configuration schema');
  if (typeof config.runtimeIdentity !== 'string' || config.runtimeIdentity.trim() === '') {
    throw new Error('Ki-Buddy runtime identity must be a non-empty string');
  }
  if (typeof config.defaults !== 'object' || config.defaults === null) {
    throw new Error('Ki-Buddy product defaults must be an object');
  }
  const defaults = config.defaults as { agentsBaseUrl?: unknown; language?: unknown };
  if (typeof defaults.agentsBaseUrl !== 'string' || defaults.agentsBaseUrl.trim() === '') {
    throw new Error('Ki-Buddy default Agents base URL must be a non-empty string');
  }
  const agentsBaseUrl = normalizeAgentsBaseUrl(defaults.agentsBaseUrl);
  if (!agentsBaseUrl) throw new Error('Ki-Buddy default Agents base URL must be a canonical HTTP(S) deployment URL');
  if (typeof defaults.language !== 'string' || !SUPPORTED_LANGUAGES.includes(defaults.language as SupportedLanguage)) {
    throw new Error('Ki-Buddy default language must be supported');
  }
  return {
    schemaVersion: 1,
    runtimeIdentity: config.runtimeIdentity,
    defaults: {
      agentsBaseUrl,
      language: defaults.language as SupportedLanguage,
    },
  };
}

export const KI_BUDDY_PRODUCT_CONFIG = parseKiBuddyProductConfig(rawProductConfig);
