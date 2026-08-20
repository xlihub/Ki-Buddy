import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  isSameAgentsCatalogIdentity,
  normalizeAgentsCatalogSelection,
  normalizeAgentsCatalogIdentity,
  normalizeAgentsInvokeResponse,
  validateAgentsScalarInputs,
  type AgentsCatalogIdentity,
  type AgentsScalarInputs,
} from './contracts';
import { AgentsMcpError, getAgentsMcpErrorPresentation, type AgentsMcpErrorCode } from './errors';
import { readBoundedJsonRequest, readBoundedJsonResponse } from './json';

const BRIDGE_HOST = '127.0.0.1';
const MAX_CATALOG_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_INVOKE_REQUEST_BYTES = 1024 * 1024;
const MAX_INVOKE_RESPONSE_BYTES = 5 * 1024 * 1024;

export type AgentsInvokeRequest = Readonly<{
  agentId: string;
  agentType: string;
  conversationId: string;
  inputs: AgentsScalarInputs;
}>;

type StartAgentsMcpBridgeOptions = Readonly<{
  fetchCatalog: (signal: AbortSignal) => Promise<Readonly<{ identity: AgentsCatalogIdentity; response: Response }>>;
  getSessionIdentity: () => Promise<AgentsCatalogIdentity>;
  invokeAgent: (
    request: AgentsInvokeRequest,
    identity: AgentsCatalogIdentity,
    signal: AbortSignal
  ) => Promise<Response>;
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

function runActiveRequest(
  request: IncomingMessage,
  response: ServerResponse,
  activeRequests: Set<AbortController>,
  operation: (signal: AbortSignal) => Promise<void>
): void {
  const controller = new AbortController();
  activeRequests.add(controller);
  const abort = (): void => controller.abort();
  request.once('aborted', abort);
  response.once('close', abort);
  void operation(controller.signal).finally(() => {
    request.off('aborted', abort);
    response.off('close', abort);
    activeRequests.delete(controller);
  });
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

async function handleInvokeRequest(
  options: StartAgentsMcpBridgeOptions,
  request: IncomingMessage,
  response: ServerResponse,
  signal: AbortSignal
): Promise<void> {
  try {
    const body = await readBoundedJsonRequest(request, MAX_INVOKE_REQUEST_BYTES);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      typeof (body as { agentId?: unknown }).agentId !== 'string'
    ) {
      throw new AgentsMcpError('invalid_input', 'Agents invoke requires one agentId');
    }
    const agentId = (body as { agentId: string }).agentId.trim();
    if (!agentId) throw new AgentsMcpError('invalid_input', 'Agents invoke requires one agentId');
    let catalogIdentity: AgentsCatalogIdentity;
    try {
      catalogIdentity = normalizeAgentsCatalogIdentity((body as { catalogIdentity?: unknown }).catalogIdentity);
    } catch {
      throw new AgentsMcpError('invalid_input', 'Agents invoke requires the described catalog identity');
    }

    const { identity, response: catalogResponse } = await options.fetchCatalog(signal);
    if (catalogResponse.status === 401 || catalogResponse.status === 403) {
      throw new AgentsMcpError('auth', 'Agents login is required');
    }
    if (!catalogResponse.ok) throw new AgentsMcpError('server', 'Agents catalog service is unavailable');
    const currentIdentity = normalizeAgentsCatalogIdentity(identity);
    if (!isSameAgentsCatalogIdentity(catalogIdentity, currentIdentity)) {
      throw new AgentsMcpError('invalid_input', 'Agents invoke describe authorization is no longer current');
    }
    const catalog = await readBoundedJsonResponse(catalogResponse, MAX_CATALOG_RESPONSE_BYTES);
    const { description } = normalizeAgentsCatalogSelection(catalog, agentId);
    const bodyInputs = (body as { inputs?: unknown }).inputs;
    const inputs = validateAgentsScalarInputs(description, bodyInputs === undefined ? {} : bodyInputs);
    const upstream = await options.invokeAgent(
      {
        agentId,
        agentType: description.agentType,
        conversationId: `ki-buddy-${randomUUID()}`,
        inputs,
      },
      currentIdentity,
      signal
    );
    if (upstream.status === 401 || upstream.status === 403) {
      throw new AgentsMcpError('auth', 'Agents login is required');
    }
    const payload = await readBoundedJsonResponse(upstream, MAX_INVOKE_RESPONSE_BYTES);
    if (!upstream.ok) {
      try {
        normalizeAgentsInvokeResponse(payload, agentId);
      } catch (error) {
        if (
          error instanceof AgentsMcpError &&
          (error.code === 'invoke_failed' ||
            (error.code === 'contract' &&
              typeof (payload as { status?: unknown })?.status === 'string' &&
              ['failed', 'error'].includes((payload as { status: string }).status.trim().toLowerCase())))
        ) {
          throw error;
        }
      }
      throw new AgentsMcpError('server', 'Agents invoke service is unavailable');
    }
    const result = normalizeAgentsInvokeResponse(payload, agentId);
    sendJson(response, 200, result);
  } catch (error) {
    if (signal.aborted) return;
    const safe = bridgeError(error instanceof AgentsMcpError ? error.code : 'network');
    sendJson(
      response,
      safe.status,
      error instanceof AgentsMcpError && error.correlation
        ? { ...safe.body, correlation: error.correlation }
        : safe.body
    );
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
    if (request.method === 'POST' && request.url === '/invoke') {
      runActiveRequest(request, response, activeRequests, (signal) =>
        handleInvokeRequest(options, request, response, signal)
      );
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
    runActiveRequest(request, response, activeRequests, (signal) => handleCatalogRequest(options, response, signal));
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
