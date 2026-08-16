import type { KiBuddyProductConfig } from '@/common/platform/ki-buddy/productConfig';

export type KiBuddyProductCapability = {
  assets: KiBuddyProductConfig['assets']['renderer'];
  brand: KiBuddyProductConfig['brand'];
  id: 'ki-buddy';
  locale: KiBuddyProductConfig['locale'];
  schemaVersion: 2;
  themes: KiBuddyProductConfig['themes'];
};
