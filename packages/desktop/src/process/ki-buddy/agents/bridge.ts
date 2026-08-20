import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AgentsCatalogIdentity } from './catalog';
import { AgentsMcpError, getAgentsMcpErrorPresentation, type AgentsMcpErrorCode } from './errors';
import { readBoundedJsonResponse } from './json';

const BRIDGE_HOST = '127.0.0.1';
const MAX_CATALOG_RESPONSE_BYTES = 5 * 1024 * 1024;

type StartAgentsMcpBridgeOptions = Readonly<{
  fetchCatalog: (signal: AbortSignal) => Promise<Readonly<{ identity: AgentsCatalogIdentity; response: Response }>>;
  getSessionIdentity: () => Promise<AgentsCatalogIdentity>;
  token?: string;
}>;

export type AgentsMcpBridgeHandle = Readonly<{
  close: () => Promise<void>;
  token: string;
  url: string;
}>;

function tokenMatches(actualHeader: string | undefined, expectedToken: string): boolean {
  if (!actualHeader?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(actualHeader.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function bridgeError(code: AgentsMcpErrorCode): Readonly<{ body: { error: string }; status: number }> {
  const presentation = getAgentsMcpErrorPresentation(code);
  return { status: presentation.bridgeStatus, body: { error: presentation.bridgeError } };
}

async function handleCatalogRequest(
  options: StartAgentsMcpBridgeOptions,
  response: ServerResponse,
  signal: AbortSignal
): Promise<void> {
  try {
    const { identity, response: upstream } = await options.fetchCatalog(signal);
    if (signal.aborted) return;
    if (upstream.status === 401 || upstream.status === 403) {
      throw new AgentsMcpError('auth', 'Agents login is required');
    }
    if (!upstream.ok) throw new AgentsMcpError('server', 'Agents catalog service is unavailable');
    const payload = await readBoundedJsonResponse(upstream, MAX_CATALOG_RESPONSE_BYTES);
    sendJson(response, 200, { identity, catalog: payload });
  } catch (error) {
    if (signal.aborted) return;
    const safe = bridgeError(error instanceof AgentsMcpError ? error.code : 'network');
    sendJson(response, safe.status, safe.body);
  }
}

async function handleSessionRequest(options: StartAgentsMcpBridgeOptions, response: ServerResponse): Promise<void> {
  try {
    sendJson(response, 200, await options.getSessionIdentity());
  } catch (error) {
    const safe = bridgeError(error instanceof AgentsMcpError ? error.code : 'auth');
    sendJson(response, safe.status, safe.body);
  }
}

/** Starts the per-app loopback bridge that keeps Agents credentials inside Electron main. */
export async function startAgentsMcpBridge(options: StartAgentsMcpBridgeOptions): Promise<AgentsMcpBridgeHandle> {
  const token = options.token?.trim() || randomBytes(32).toString('base64url');
  const activeRequests = new Set<AbortController>();
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (!tokenMatches(request.headers.authorization, token)) {
      sendJson(response, 401, { error: 'adapter_auth_required' });
      return;
    }
    if (request.method !== 'GET' || !['/catalog', '/session'].includes(request.url ?? '')) {
      sendJson(response, 404, { error: 'not_found' });
      return;
    }
    if (request.url === '/session') {
      void handleSessionRequest(options, response);
      return;
    }
    const controller = new AbortController();
    activeRequests.add(controller);
    const abort = (): void => controller.abort();
    request.once('aborted', abort);
    response.once('close', abort);
    void handleCatalogRequest(options, response, controller.signal).finally(() => {
      request.off('aborted', abort);
      response.off('close', abort);
      activeRequests.delete(controller);
    });
  });
  server.maxHeadersCount = 32;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(0, BRIDGE_HOST, () => {
      server.off('error', onError);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new AgentsMcpError('configuration', 'Agents Adapter bridge did not bind a TCP port');
  }

  return {
    token,
    url: `http://${BRIDGE_HOST}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const controller of activeRequests) controller.abort();
        activeRequests.clear();
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
