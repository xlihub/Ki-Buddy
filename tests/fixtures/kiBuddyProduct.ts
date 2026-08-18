import {
  KI_BUDDY_PRODUCT_CAPABILITY,
  type ProductFeatureId,
  type ProductFeatureState,
} from '@/common/platform/ki-buddy';

/** Activates a valid Ki-Buddy bootstrap capability with optional feature-state overrides. */
export function activateKiBuddyProduct(
  featureOverrides: Partial<Record<ProductFeatureId, ProductFeatureState>> = {}
): void {
  window.__kiBuddyProductPresentation = {
    ...KI_BUDDY_PRODUCT_CAPABILITY,
    experience: {
      ...KI_BUDDY_PRODUCT_CAPABILITY.experience,
      features: {
        ...KI_BUDDY_PRODUCT_CAPABILITY.experience.features,
        ...featureOverrides,
      },
    },
  };
}
