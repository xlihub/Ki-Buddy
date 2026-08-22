import { isIP } from 'node:net';
import { session } from 'electron';
import { AGENTS_MCP_CLIENT_ID_HEADER, isAgentsMcpClientId } from './contracts';

const AGENTS_NETWORK_PARTITION = 'ki-buddy-agents-network';
const ALLOWED_SELF_SIGNED_ERRORS = new Set(['CERT_AUTHORITY_INVALID', 'CERT_COMMON_NAME_INVALID']);
const SERVER_NEXT_GATEWAY_API_PREFIX = '/kagents_core/api';
const AGENTS_BRIDGE_PATH_PREFIX = '/bridge/agents/';

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

/** Creates the isolated Chromium-network client used only for Agents authentication requests. */
export function createAgentsNetworkFetch(): typeof fetch {
  const agentsSessions = new Map<'catalog' | 'invoke', Electron.Session>();
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const requestUrl = input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const clientId = headers.get(AGENTS_MCP_CLIENT_ID_HEADER);
    if (clientId !== null && !isAgentsMcpClientId(clientId)) {
      throw new Error('Agents network client identity is invalid');
    }
    headers.delete(AGENTS_MCP_CLIENT_ID_HEADER);
    const requestKind = new URL(requestUrl).pathname.endsWith('/bridge/agents/invoke') ? 'invoke' : 'catalog';
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
