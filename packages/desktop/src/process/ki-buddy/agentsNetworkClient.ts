import { isIP } from 'node:net';
import { session } from 'electron';

const AGENTS_NETWORK_PARTITION = 'ki-buddy-agents-network';
const ALLOWED_SELF_SIGNED_ERRORS = new Set(['CERT_AUTHORITY_INVALID', 'CERT_COMMON_NAME_INVALID']);

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
  let agentsSession: Electron.Session | null = null;
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (!agentsSession) {
      agentsSession = session.fromPartition(AGENTS_NETWORK_PARTITION, { cache: false });
      agentsSession.setCertificateVerifyProc((request, callback) => {
        callback(canTrustPrivateSelfSignedCertificate(request) ? 0 : -3);
      });
    }
    const request = input instanceof URL ? input.toString() : input;
    return agentsSession.fetch(request, init);
  }) as typeof fetch;
}
