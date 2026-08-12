import { KI_BUDDY_PRODUCT_CONFIG } from './productConfig';

export const KI_BUDDY_PRODUCT_RUNTIME = KI_BUDDY_PRODUCT_CONFIG.runtimeIdentity;

/** Returns whether packaged product metadata explicitly selects the Ki-Buddy runtime. */
export function resolveKiBuddyRuntimeIdentity(metadata: unknown): boolean {
  if (typeof metadata !== 'object' || metadata === null) return false;
  return (metadata as { productRuntime?: unknown }).productRuntime === KI_BUDDY_PRODUCT_RUNTIME;
}
