/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
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

import {
  createAgentsGatewayClient,
  createAgentsNetworkFetch,
  resolveAgentsRequestUrl,
} from '@/process/ki-buddy/agents/networkClient';

const gatewayClientId = '11111111-1111-4111-8111-111111111111';

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

  it('routes requests without stdio identity through the catalog session', async () => {
    electronMock.fetch.mockResolvedValue(new Response(null, { status: 204 }));

    const agentsFetch = createAgentsNetworkFetch();
    expect(electronMock.fromPartition).not.toHaveBeenCalled();
    await agentsFetch('https://192.168.0.8:8443/kagent/login', { method: 'POST' });

    expect(electronMock.fromPartition).toHaveBeenCalledWith('ki-buddy-agents-network-catalog', { cache: false });
    expect(electronMock.fetch).toHaveBeenCalledWith('https://192.168.0.8:8443/kagent/login', { method: 'POST' });
  });

  it('rejects a malformed stdio client identity before creating a network partition', () => {
    const agentsFetch = createAgentsNetworkFetch();

    expect(() =>
      agentsFetch('https://192.168.0.8:8443/kagents_core/api/bridge/agents/catalog', {
        headers: { 'x-ki-buddy-agents-client-id': 'not-a-client-id' },
      })
    ).toThrow('Agents network client identity is invalid');
    expect(electronMock.fromPartition).not.toHaveBeenCalled();
    expect(electronMock.fetch).not.toHaveBeenCalled();
  });

  it('does not forward a local identity supplied through Request init headers', async () => {
    electronMock.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const agentsFetch = createAgentsNetworkFetch();
    const request = new Request('https://192.168.0.8:8443/kagents_core/api/bridge/agents/invoke', {
      method: 'POST',
    });

    await agentsFetch(request, {
      headers: {
        'x-ki-buddy-agents-client-id': '11111111-1111-4111-8111-111111111111',
        'x-request-context': 'preserved',
      },
    });

    const [forwardedRequest, forwardedInit] = electronMock.fetch.mock.calls[0] ?? [];
    expect(forwardedInit).toBeUndefined();
    expect(new Headers((forwardedRequest as Request).headers).has('x-ki-buddy-agents-client-id')).toBe(false);
    expect(new Headers((forwardedRequest as Request).headers).get('x-request-context')).toBe('preserved');
  });

  it('does not forward a local identity stored on a Request', async () => {
    electronMock.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const agentsFetch = createAgentsNetworkFetch();
    const request = new Request('https://192.168.0.8:8443/kagents_core/api/bridge/agents/catalog', {
      headers: {
        'x-ki-buddy-agents-client-id': '11111111-1111-4111-8111-111111111111',
        'x-request-context': 'preserved',
      },
    });

    await agentsFetch(request);

    const [forwardedRequest, forwardedInit] = electronMock.fetch.mock.calls[0] ?? [];
    expect(forwardedInit).toBeUndefined();
    expect(new Headers((forwardedRequest as Request).headers).has('x-ki-buddy-agents-client-id')).toBe(false);
    expect(new Headers((forwardedRequest as Request).headers).get('x-request-context')).toBe('preserved');
  });

  it('uses fixed catalog, upload, and invoke sessions across many stdio clients without forwarding local identities', async () => {
    const invokeFetch = vi.fn().mockResolvedValue(Response.json({ state: 'completed' }));
    const uploadFetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ errorCode: 0, responseBody: { fileUrl: 'https://agents.example.test/files/1' } })
      );
    const catalogFetch = vi.fn().mockResolvedValue(Response.json({ status: 'ok', agents: [] }));
    electronMock.fromPartition.mockImplementation((partition: string) => ({
      fetch: partition.endsWith('-invoke') ? invokeFetch : partition.endsWith('-upload') ? uploadFetch : catalogFetch,
      setCertificateVerifyProc: vi.fn(),
    }));
    const agentsFetch = createAgentsNetworkFetch();

    const requests = Array.from({ length: 60 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, '0');
      const clientId = `11111111-1111-4111-8111-${suffix}`;
      const requestKind = index % 3 === 0 ? 'invoke' : index % 3 === 1 ? 'catalog' : 'upload';
      const requestPath =
        requestKind === 'upload' ? '/kagent/sys/file/upload' : `/kagents_core/api/bridge/agents/${requestKind}`;
      return agentsFetch(`https://192.168.0.8:8443${requestPath}`, {
        method: requestKind === 'catalog' ? 'GET' : 'POST',
        headers: { 'x-ki-buddy-agents-client-id': clientId },
      });
    });
    await Promise.all(requests);

    expect(electronMock.fromPartition).toHaveBeenCalledWith('ki-buddy-agents-network-invoke', { cache: false });
    expect(electronMock.fromPartition).toHaveBeenCalledWith('ki-buddy-agents-network-upload', { cache: false });
    expect(electronMock.fromPartition).toHaveBeenCalledWith('ki-buddy-agents-network-catalog', { cache: false });
    expect(electronMock.fromPartition).toHaveBeenCalledTimes(3);
    expect(invokeFetch.mock.calls[0]?.[1]).toMatchObject({ headers: expect.any(Headers) });
    const invokeHeaders = invokeFetch.mock.calls[0]?.[1]?.headers;
    const catalogHeaders = catalogFetch.mock.calls[0]?.[1]?.headers;
    expect(invokeHeaders).toBeInstanceOf(Headers);
    expect(catalogHeaders).toBeInstanceOf(Headers);
    expect(new Headers(invokeHeaders).has('x-ki-buddy-agents-client-id')).toBe(false);
    expect(new Headers(catalogHeaders).has('x-ki-buddy-agents-client-id')).toBe(false);
  });

  it('lets two invokes enter the shared network session concurrently', async () => {
    const finishInvokes: Array<(response: Response) => void> = [];
    const invokeFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finishInvokes.push(resolve);
        })
    );
    electronMock.fromPartition.mockImplementation(() => ({
      fetch: invokeFetch,
      setCertificateVerifyProc: vi.fn(),
    }));
    const agentsFetch = createAgentsNetworkFetch();

    const firstInvoke = agentsFetch('https://192.168.0.8:8443/kagents_core/api/bridge/agents/invoke', {
      method: 'POST',
      headers: { 'x-ki-buddy-agents-client-id': '11111111-1111-4111-8111-111111111111' },
    });
    const secondInvoke = agentsFetch('https://192.168.0.8:8443/kagents_core/api/bridge/agents/invoke', {
      method: 'POST',
      headers: { 'x-ki-buddy-agents-client-id': '22222222-2222-4222-8222-222222222222' },
    });

    await vi.waitFor(() => expect(invokeFetch).toHaveBeenCalledTimes(2));
    expect(electronMock.fromPartition).toHaveBeenCalledTimes(1);

    finishInvokes.forEach((finish) => finish(Response.json({ state: 'completed' })));
    await Promise.all([firstInvoke, secondInvoke]);
  });
});

describe('Ki-Buddy Agents gateway client', () => {
  it('streams multipart content and normalizes the remote upload response', async () => {
    const response = Response.json({
      errorCode: 0,
      responseBody: { fileUrl: 'https://agents.example.test/files/remote-1' },
    });
    const fetchAuthenticated = vi.fn().mockResolvedValue(response);
    const client = createAgentsGatewayClient({ fetchAuthenticated, getSessionEpoch: () => 1 });
    const body = Readable.from(['multipart-body']) as IncomingMessage;
    const signal = new AbortController().signal;

    await expect(
      client.uploadFile(body, 'multipart/form-data; boundary=boundary-1', 1, gatewayClientId, signal)
    ).resolves.toEqual({ fileUrl: 'https://agents.example.test/files/remote-1', sessionEpoch: 1 });
    expect(fetchAuthenticated).toHaveBeenCalledWith(
      '/kagent/sys/file/upload',
      expect.objectContaining({
        body: expect.any(ReadableStream),
        duplex: 'half',
        method: 'POST',
        signal,
      })
    );
  });

  it.each([
    ['expired authentication', 401, {}, 'auth'],
    ['remote server failure', 500, {}, 'server'],
    ['rejected upload envelope', 200, { errorCode: 1, responseBody: {} }, 'server'],
    ['incompatible upload envelope', 200, { errorCode: 0, responseBody: {} }, 'contract'],
  ])('classifies %s before returning an uploaded file', async (_scenario, status, payload, expectedCode) => {
    const client = createAgentsGatewayClient({
      fetchAuthenticated: vi.fn().mockResolvedValue(Response.json(payload, { status })),
      getSessionEpoch: () => 1,
    });
    const body = Readable.from(['multipart-body']) as IncomingMessage;

    await expect(
      client.uploadFile(
        body,
        'multipart/form-data; boundary=boundary-1',
        1,
        gatewayClientId,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it('rejects upload before remote dispatch when the catalog session is no longer current', async () => {
    const fetchAuthenticated = vi.fn();
    const client = createAgentsGatewayClient({ fetchAuthenticated, getSessionEpoch: () => 2 });
    const body = Readable.from(['multipart-body']) as IncomingMessage;

    await expect(
      client.uploadFile(
        body,
        'multipart/form-data; boundary=boundary-1',
        1,
        gatewayClientId,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'auth' });
    expect(fetchAuthenticated).not.toHaveBeenCalled();
  });

  it('classifies an interrupted upload as auth when the session changes during dispatch', async () => {
    let sessionEpoch = 1;
    const fetchAuthenticated = vi.fn(async () => {
      sessionEpoch = 2;
      throw new Error('request aborted by session replacement');
    });
    const client = createAgentsGatewayClient({ fetchAuthenticated, getSessionEpoch: () => sessionEpoch });
    const body = Readable.from(['multipart-body']) as IncomingMessage;

    await expect(
      client.uploadFile(
        body,
        'multipart/form-data; boundary=boundary-1',
        1,
        gatewayClientId,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'auth' });
    expect(fetchAuthenticated).toHaveBeenCalledOnce();
  });
});
