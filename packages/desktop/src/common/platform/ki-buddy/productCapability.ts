import type { KiBuddyProductCapability } from '@/common/types/platform/kiBuddyProduct';
import { KI_BUDDY_PRODUCT_CONFIG } from './productConfig';

/** Serializable renderer capability for the configured Ki-Buddy product runtime. */
export const KI_BUDDY_PRODUCT_CAPABILITY = {
  id: 'ki-buddy',
  schemaVersion: 2,
  brand: KI_BUDDY_PRODUCT_CONFIG.brand,
  assets: KI_BUDDY_PRODUCT_CONFIG.assets.renderer,
  locale: KI_BUDDY_PRODUCT_CONFIG.locale,
  themes: KI_BUDDY_PRODUCT_CONFIG.themes,
} satisfies KiBuddyProductCapability;
