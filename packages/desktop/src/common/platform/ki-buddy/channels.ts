export const KI_BUDDY_CORE_TRANSPORT_CHANNEL = 'ki-buddy:core-transport:get-csrf-token';
export const KI_BUDDY_PRODUCT_BOOTSTRAP_CHANNEL = 'ki-buddy:product-bootstrap:get';

const KI_BUDDY_CORE_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Returns whether a Core request method may omit Ki-Buddy's CSRF proof. */
export function isKiBuddyCoreSafeMethod(method: string): boolean {
  return KI_BUDDY_CORE_SAFE_METHODS.has(method.toUpperCase());
}
