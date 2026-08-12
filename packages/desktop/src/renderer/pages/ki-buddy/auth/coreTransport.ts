import { setHttpRequestTransport } from '@/common/adapter/httpBridge';
import { isKiBuddyCoreSafeMethod } from '@/common/platform/ki-buddy';

type UnauthorizedHandler = () => Promise<void> | void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let invalidationPromise: Promise<void> | null = null;

async function invalidateKiBuddySession(): Promise<void> {
  if (!unauthorizedHandler) return;
  invalidationPromise ??= Promise.resolve(unauthorizedHandler()).finally(() => {
    invalidationPromise = null;
  });
  await invalidationPromise;
}

/** Registers the active Ki-Buddy auth provider as the owner of runtime 401 cleanup. */
export function registerKiBuddyUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

/** Installs Ki-Buddy's renderer-side Core CSRF policy when its preload capability exists. */
export function installKiBuddyRendererCoreTransport(): boolean {
  const capability = window.electronAPI?.kiBuddyCoreTransport;
  if (!capability) return false;

  setHttpRequestTransport({
    getCredentials: () => 'include',
    getHeaders: ({ method }) => (isKiBuddyCoreSafeMethod(method) ? {} : { 'x-csrf-token': capability.csrfToken }),
    onUnauthorized: invalidateKiBuddySession,
  });
  return true;
}
