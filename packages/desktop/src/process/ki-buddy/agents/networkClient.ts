import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { session } from 'electron';
import { AGENTS_MCP_CLIENT_ID_HEADER, isAgentsMcpClientId, type AgentsInvokeRequest } from './contracts';
import { AgentsMcpError } from './errors';
import { readBoundedJsonResponse } from './json';

const AGENTS_NETWORK_PARTITION = 'ki-buddy-agents-network';
const ALLOWED_SELF_SIGNED_ERRORS = new Set(['CERT_AUTHORITY_INVALID', 'CERT_COMMON_NAME_INVALID']);
const SERVER_NEXT_GATEWAY_API_PREFIX = '/kagents_core/api';
const AGENTS_BRIDGE_PATH_PREFIX = '/bridge/agents/';
const MAX_UPLOAD_RESPONSE_BYTES = 64 * 1024;

type AgentsGatewayTransport = Readonly<{
  fetchAuthenticated: (path: string, init?: RequestInit) => Promise<Response>;
  getSessionEpoch: () => number;
}>;

type StreamingRequestInit = RequestInit & Readonly<{ duplex: 'half' }>;

function normalizeAgentsUploadResponse(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentsMcpError('contract', 'Agents upload response is incompatible');
  }
  const envelope = value as { errorCode?: unknown; responseBody?: unknown };
  if (envelope.errorCode !== 0) throw new AgentsMcpError('server', 'Agents file upload failed');
  if (!envelope.responseBody || typeof envelope.responseBody !== 'object' || Array.isArray(envelope.responseBody)) {
    throw new AgentsMcpError('contract', 'Agents upload response is incompatible');
  }
  const fileUrl = (envelope.responseBody as { fileUrl?: unknown }).fileUrl;
  if (typeof fileUrl !== 'string' || fileUrl.trim().length === 0) {
    throw new AgentsMcpError('contract', 'Agents upload response is incompatible');
  }
  return fileUrl;
}

function isAgentsBridgePath(path: string): boolean {
  try {
    return new URL(path, 'https://ki-buddy.invalid').pathname.startsWith(AGENTS_BRIDGE_PATH_PREFIX);
  } catch {
    return false;
  }
}

/** Resolves Bridge routes exposed by the authenticated deployment's HTTPS server_next gateway. */
export function resolveAgentsRequestUrl(baseUrl: string, path: string): string {
  if (isAgentsBridgePath(path)) {
    return `${new URL(baseUrl).origin}${SERVER_NEXT_GATEWAY_API_PREFIX}${path}`;
  }
  return `${baseUrl}${path}`;
}

/** Creates the authenticated product client for the remote Agents gateway contract. */
export function createAgentsGatewayClient(transport: AgentsGatewayTransport) {
  return {
    fetchCatalog: async (clientId: string, signal: AbortSignal) => {
      const sessionEpoch = transport.getSessionEpoch();
      try {
        const response = await transport.fetchAuthenticated('/bridge/agents/catalog', {
          method: 'GET',
          headers: { accept: 'application/json', [AGENTS_MCP_CLIENT_ID_HEADER]: clientId },
          signal,
        });
        if (transport.getSessionEpoch() !== sessionEpoch) {
          throw new AgentsMcpError('auth', 'Agents session changed during catalog refresh');
        }
        return { response, sessionEpoch };
      } catch (error) {
        if (error instanceof AgentsMcpError) throw error;
        throw new AgentsMcpError('network', 'Agents catalog request failed');
      }
    },
    invokeAgent: async (request: AgentsInvokeRequest, sessionEpoch: number, clientId: string, signal: AbortSignal) => {
      if (transport.getSessionEpoch() !== sessionEpoch) {
        throw new AgentsMcpError('auth', 'Agents session changed before invoke dispatch');
      }
      try {
        return await transport.fetchAuthenticated('/bridge/agents/invoke', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            [AGENTS_MCP_CLIENT_ID_HEADER]: clientId,
          },
          body: JSON.stringify(request),
          signal,
        });
      } catch (error) {
        if (error instanceof AgentsMcpError) throw error;
        throw new AgentsMcpError('result_unknown', 'Agents invoke result is unknown', {
          agentId: request.agentId,
        });
      }
    },
    uploadFile: async (
      body: IncomingMessage,
      contentType: string,
      sessionEpoch: number,
      clientId: string,
      signal: AbortSignal
    ) => {
      if (transport.getSessionEpoch() !== sessionEpoch) {
        throw new AgentsMcpError('auth', 'Agents session changed before file upload dispatch');
      }
      try {
        const init: StreamingRequestInit = {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': contentType,
            [AGENTS_MCP_CLIENT_ID_HEADER]: clientId,
          },
          body: Readable.toWeb(body) as unknown as BodyInit,
          duplex: 'half',
          signal,
        };
        const response = await transport.fetchAuthenticated('/kagent/sys/file/upload', init);
        if (transport.getSessionEpoch() !== sessionEpoch) {
          throw new AgentsMcpError('auth', 'Agents session changed during file upload');
        }
        if (response.status === 401 || response.status === 403) {
          throw new AgentsMcpError('auth', 'Agents login is required');
        }
        if (!response.ok) throw new AgentsMcpError('server', 'Agents file upload failed');
        const payload = await readBoundedJsonResponse(response, MAX_UPLOAD_RESPONSE_BYTES);
        return { fileUrl: normalizeAgentsUploadResponse(payload), sessionEpoch };
      } catch (error) {
        if (transport.getSessionEpoch() !== sessionEpoch) {
          throw new AgentsMcpError('auth', 'Agents session changed during file upload');
        }
        if (error instanceof AgentsMcpError) throw error;
        throw new AgentsMcpError('network', 'Agents file upload request failed');
      }
    },
  };
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
  );
}

function isPrivateIp(hostname: string): boolean {
  const version = isIP(hostname);
  return version === 4 ? isPrivateIpv4(hostname) : version === 6 && isPrivateIpv6(hostname);
}

function normalizedCertificateError(verificationResult: string): string {
  return verificationResult.replace(/^net::/, '').replace(/^ERR_/, '');
}

function canTrustPrivateSelfSignedCertificate(request: Electron.Request): boolean {
  return (
    isPrivateIp(request.hostname) &&
    !request.isIssuedByKnownRoot &&
    ALLOWED_SELF_SIGNED_ERRORS.has(normalizedCertificateError(request.verificationResult))
  );
}

/** Creates the isolated Chromium-network transport used for authenticated Agents requests. */
export function createAgentsNetworkFetch(): typeof fetch {
  const agentsSessions = new Map<'catalog' | 'invoke' | 'upload', Electron.Session>();
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const requestUrl = input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const clientId = headers.get(AGENTS_MCP_CLIENT_ID_HEADER);
    if (clientId !== null && !isAgentsMcpClientId(clientId)) {
      throw new Error('Agents network client identity is invalid');
    }
    headers.delete(AGENTS_MCP_CLIENT_ID_HEADER);
    const pathname = new URL(requestUrl).pathname;
    const requestKind = pathname.endsWith('/bridge/agents/invoke')
      ? 'invoke'
      : pathname.endsWith('/kagent/sys/file/upload')
        ? 'upload'
        : 'catalog';
    let agentsSession = agentsSessions.get(requestKind);
    if (!agentsSession) {
      agentsSession = session.fromPartition(`${AGENTS_NETWORK_PARTITION}-${requestKind}`, { cache: false });
      agentsSession.setCertificateVerifyProc((request, callback) => {
        callback(canTrustPrivateSelfSignedCertificate(request) ? 0 : -3);
      });
      agentsSessions.set(requestKind, agentsSession);
    }
    if (input instanceof Request) {
      return agentsSession.fetch(new Request(input, { ...init, headers }));
    }
    const request = input instanceof URL ? input.toString() : input;
    const requestInit = clientId ? { ...init, headers } : init;
    return agentsSession.fetch(request, requestInit);
  }) as typeof fetch;
}
