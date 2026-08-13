import { setHttpRequestTransport } from '@/common/adapter/httpBridge';
import { isKiBuddyCoreSafeMethod } from '@/common/platform/ki-buddy';

/** Installs Ki-Buddy's renderer-side Core CSRF policy when its preload capability exists. */
export function installKiBuddyRendererCoreTransport(): boolean {
  const capability = window.electronAPI?.kiBuddyCoreTransport;
  if (!capability) return false;

  setHttpRequestTransport({
    getCredentials: () => 'include',
    getHeaders: ({ method }) => (isKiBuddyCoreSafeMethod(method) ? {} : { 'x-csrf-token': capability.csrfToken }),
  });
  return true;
}
