/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type CertificateRequest = {
  hostname: string;
  isIssuedByKnownRoot: boolean;
  verificationResult: string;
};

type CertificateVerifier = (request: CertificateRequest, callback: (result: number) => void) => void;

const electronMock = vi.hoisted(() => ({
  fetch: vi.fn(),
  fromPartition: vi.fn(),
  setCertificateVerifyProc: vi.fn(),
}));

vi.mock('electron', () => ({
  session: {
    fromPartition: electronMock.fromPartition,
  },
}));

import { createAgentsNetworkFetch, resolveAgentsRequestUrl } from '@/process/ki-buddy/agents/networkClient';

describe('Ki-Buddy Agents request routing', () => {
  it.each(['/bridge/agents/catalog', '/bridge/agents/invoke', '/bridge/agents/future-capability?requestId=123'])(
    'routes the Bridge service path %s through its deployment HTTPS server_next gateway',
    (path) => {
      expect(resolveAgentsRequestUrl('https://agents.example.com', path)).toBe(
        `https://agents.example.com/kagents_core/api${path}`
      );
    }
  );

  it('routes Bridge paths from the deployment origin when the login URL has a path prefix', () => {
    expect(
      resolveAgentsRequestUrl('https://agents.example.com:28443/tenant/login-root', '/bridge/agents/catalog')
    ).toBe('https://agents.example.com:28443/kagents_core/api/bridge/agents/catalog');
  });

  it.each([
    {
      baseUrl: 'https://agents.example.com',
      path: '/kagent/system/user/validateToken',
      expected: 'https://agents.example.com/kagent/system/user/validateToken',
    },
    {
      baseUrl: 'https://agents.example.com/tenant/login-root',
      path: '/kagent/system/user/validateToken',
      expected: 'https://agents.example.com/tenant/login-root/kagent/system/user/validateToken',
    },
    {
      baseUrl: 'https://agents.example.com',
      path: '/bridge/agents/../system/user/validateToken',
      expected: 'https://agents.example.com/bridge/agents/../system/user/validateToken',
    },
  ])('keeps $path on its authenticated deployment $baseUrl', ({ baseUrl, expected, path }) => {
    expect(resolveAgentsRequestUrl(baseUrl, path)).toBe(expected);
  });
});

describe('Ki-Buddy Agents network client', () => {
  beforeEach(() => {
    electronMock.fetch.mockReset();
    electronMock.fromPartition.mockReset();
    electronMock.setCertificateVerifyProc.mockReset();
    electronMock.fromPartition.mockReturnValue({
      fetch: electronMock.fetch,
      setCertificateVerifyProc: electronMock.setCertificateVerifyProc,
    });
  });

  it.each([
    { hostname: '10.0.0.8', verificationResult: 'ERR_CERT_AUTHORITY_INVALID' },
    { hostname: '172.16.0.8', verificationResult: 'ERR_CERT_AUTHORITY_INVALID' },
    { hostname: '192.168.0.8', verificationResult: 'ERR_CERT_COMMON_NAME_INVALID' },
    { hostname: '::1', verificationResult: 'ERR_CERT_AUTHORITY_INVALID' },
    { hostname: 'fd00::8', verificationResult: 'ERR_CERT_AUTHORITY_INVALID' },
  ])(
    'accepts $verificationResult for self-signed private deployment $hostname',
    async ({ hostname, verificationResult }) => {
      electronMock.fetch.mockResolvedValue(new Response(null, { status: 204 }));
      const agentsFetch = createAgentsNetworkFetch();
      const authority = hostname.includes(':') ? `[${hostname}]` : hostname;
      await agentsFetch(`https://${authority}:8443/kagent/login`);
      const verify = electronMock.setCertificateVerifyProc.mock.calls[0]?.[0] as CertificateVerifier;
      const callback = vi.fn();

      verify({ hostname, isIssuedByKnownRoot: false, verificationResult }, callback);

      expect(callback).toHaveBeenCalledWith(0);
    }
  );

  it.each([
    { hostname: 'agents.example.com', isIssuedByKnownRoot: false, verificationResult: 'ERR_CERT_AUTHORITY_INVALID' },
    { hostname: '192.168.0.8', isIssuedByKnownRoot: true, verificationResult: 'ERR_CERT_COMMON_NAME_INVALID' },
    { hostname: '192.168.0.8', isIssuedByKnownRoot: false, verificationResult: 'ERR_CERT_DATE_INVALID' },
  ])('keeps Chromium certificate verification for $hostname / $verificationResult', async (request) => {
    electronMock.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const agentsFetch = createAgentsNetworkFetch();
    await agentsFetch('https://192.168.0.8:8443/kagent/login');
    const verify = electronMock.setCertificateVerifyProc.mock.calls[0]?.[0] as CertificateVerifier;
    const callback = vi.fn();

    verify(request, callback);

    expect(callback).toHaveBeenCalledWith(-3);
  });

  it('uses a non-persistent cache-free Electron session for Agents requests', async () => {
    electronMock.fetch.mockResolvedValue(new Response(null, { status: 204 }));

    const agentsFetch = createAgentsNetworkFetch();
    expect(electronMock.fromPartition).not.toHaveBeenCalled();
    await agentsFetch('https://192.168.0.8:8443/kagent/login', { method: 'POST' });

    expect(electronMock.fromPartition).toHaveBeenCalledWith('ki-buddy-agents-network', { cache: false });
    expect(electronMock.fetch).toHaveBeenCalledWith('https://192.168.0.8:8443/kagent/login', { method: 'POST' });
  });
});
