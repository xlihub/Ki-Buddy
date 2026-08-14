export {
  KI_BUDDY_DEFAULT_AGENTS_BASE_URL,
  KI_BUDDY_DEFAULT_LANGUAGE,
  resolveLanguagePreference,
} from './productDefaults';
export { normalizeAgentsBaseUrl } from './deploymentUrl';
export { KI_BUDDY_PRODUCT_RUNTIME, resolveKiBuddyRuntimeIdentity } from './runtimeIdentity';
export { applyKiBuddyLocaleOverlay } from './localeOverlay';
export { KI_BUDDY_PRODUCT_CAPABILITY } from './productCapability';
export { KI_BUDDY_PRODUCT_CONFIG, parseKiBuddyProductConfig } from './productConfig';
export { KI_BUDDY_CORE_TRANSPORT_CHANNEL, isKiBuddyCoreSafeMethod } from './channels';
export type { KiBuddyProductConfig } from './productConfig';
