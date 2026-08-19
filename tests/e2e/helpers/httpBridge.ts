import type { Page } from '@playwright/test';

/**
 * HTTP bridge helper for E2E tests.
 *
 * The renderer migrated from IPC `invokeBridge('subscribe-<key>')` to direct
 * HTTP calls against `aioncore` via `fetch('http://127.0.0.1:<port>/api/...')`.
 * The backend port is exposed on `window.__backendPort` by the preload script
 * (`src/preload/main.ts:71`).
 *
 * These helpers drive backend calls from the renderer context (via `page.evaluate`)
 * so tests execute in the same network context the app itself uses — identical
 * port, identical base URL, no host-side HTTP plumbing.
 *
 * Backend responses are wrapped as `{ success, data, ... }`. This helper unwraps
 * `data` when present, matching `httpBridge.ts:76` in the renderer adapter.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type RendererBackendRequest = Readonly<{
  body?: unknown;
  method: HttpMethod;
  path: string;
  timeoutMs?: number;
}>;

/** Executes one authenticated backend request from the renderer network context. */
export async function fetchBackendFromRenderer({
  body,
  method,
  path,
  timeoutMs,
}: RendererBackendRequest): Promise<unknown> {
  const port = window.__backendPort;
  if (!port) throw new Error('window.__backendPort is not available in renderer context');

  const effectiveBody = body !== undefined ? body : method === 'DELETE' ? {} : undefined;
  const headers: Record<string, string> = {};
  if (effectiveBody !== undefined) headers['Content-Type'] = 'application/json';
  const csrfToken = window.electronAPI?.kiBuddyCoreTransport?.csrfToken;
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['x-csrf-token'] = csrfToken;

  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = timeoutMs ? window.setTimeout(() => controller?.abort(), timeoutMs) : undefined;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      credentials: 'include',
      signal: controller?.signal,
      ...(effectiveBody !== undefined && method !== 'GET' ? { body: JSON.stringify(effectiveBody) } : {}),
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new Error(`Backend ${method} ${path} failed (${response.status}): ${JSON.stringify(errorBody)}`);
    }

    if (!response.headers.get('Content-Type')?.includes('application/json')) return undefined;
    const json = (await response.json()) as unknown;
    return json && typeof json === 'object' && 'data' in json ? (json as { data: unknown }).data : json;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

export async function httpInvoke<T = unknown>(
  page: Page,
  method: HttpMethod,
  path: string,
  body?: unknown
): Promise<T> {
  return page.evaluate(fetchBackendFromRenderer, { method, path, body }) as Promise<T>;
}

export const httpGet = <T = unknown>(page: Page, path: string) => httpInvoke<T>(page, 'GET', path);
export const httpPost = <T = unknown>(page: Page, path: string, body?: unknown) =>
  httpInvoke<T>(page, 'POST', path, body);
export const httpDelete = <T = unknown>(page: Page, path: string) => httpInvoke<T>(page, 'DELETE', path);
