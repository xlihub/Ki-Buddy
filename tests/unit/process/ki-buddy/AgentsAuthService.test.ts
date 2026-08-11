/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentsAuthService } from '@/process/ki-buddy/AgentsAuthService';

const fetchMock = vi.fn<typeof fetch>();
const loadSessionMock = vi.fn();
const saveSessionMock = vi.fn();
const clearSessionMock = vi.fn();
const setCoreCookieMock = vi.fn();
const clearCoreCookieMock = vi.fn();

describe('AgentsAuthService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    loadSessionMock.mockReset();
    saveSessionMock.mockReset();
    clearSessionMock.mockReset();
    setCoreCookieMock.mockReset();
    clearCoreCookieMock.mockReset();
  });

  it('projects the verified Agents identity and returns the resulting Core user', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorCode: 0,
            message: 'success',
            responseBody: {
              uuid: 'agents-user-42',
              userName: 'agents-user@example.com',
              email: 'agents-user@example.com',
              token: 'agents-token',
              expiresIn: 7200,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user_id: 'core-user-42',
              user_type: 'aionpro',
              external_user_id: 'opaque-external-id',
              session_generation: 0,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user: { id: 'core-user-42', username: 'agents-user@example.com' },
              session_generation: 0,
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'set-cookie': 'aionui_session=core-token; HttpOnly; Path=/; SameSite=Lax',
            },
          }
        )
      );

    const service = new AgentsAuthService({
      bootstrapSecret: 'bootstrap-secret',
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    const result = await service.login({
      baseUrl: 'https://AGENTS.example.com/',
      loginName: 'agents-user@example.com',
      password: 'correct-password',
    });

    expect(result).toEqual({
      success: true,
      session: {
        status: 'authenticated',
        user: { id: 'core-user-42', username: 'agents-user@example.com' },
      },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://agents.example.com/api/auth/login');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      body: JSON.stringify({ loginName: 'agents-user@example.com', password: 'correct-password' }),
    });
    const provisionUrl = String(fetchMock.mock.calls[1]?.[0]);
    const projectedIdentity = decodeURIComponent(provisionUrl.slice(provisionUrl.lastIndexOf('/') + 1));
    const sessionBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as {
      external_user_id?: string;
    };
    expect(projectedIdentity).toMatch(/^agents-v1-[A-Za-z0-9_-]{43}$/);
    expect(projectedIdentity).toBe(sessionBody.external_user_id);
    expect(projectedIdentity).not.toContain('agents-user-42');
    expect(projectedIdentity).not.toContain('agents.example.com');
    expect(saveSessionMock).toHaveBeenCalledWith({
      baseUrl: 'https://agents.example.com',
      token: 'agents-token',
      userId: 'agents-user-42',
    });
    expect(setCoreCookieMock).toHaveBeenCalledWith('aionui_session=core-token; HttpOnly; Path=/; SameSite=Lax');
  });

  it('validates a saved Agents token before restoring its Core user', async () => {
    loadSessionMock.mockResolvedValue({
      baseUrl: 'https://agents.example.com',
      token: 'saved-agents-token',
      userId: 'agents-user-42',
    });
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorCode: 0,
            responseBody: {
              uuid: 'agents-user-42',
              userName: 'agents-user@example.com',
              email: 'agents-user@example.com',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user_id: 'core-user-42',
              user_type: 'aionpro',
              external_user_id: 'opaque-external-id',
              session_generation: 1,
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user: { id: 'core-user-42', username: 'agents-user@example.com' },
              session_generation: 1,
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'set-cookie': 'aionui_session=restored-core-token; HttpOnly; Path=/; SameSite=Lax',
            },
          }
        )
      );

    const service = new AgentsAuthService({
      bootstrapSecret: 'bootstrap-secret',
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    const session = await service.getSession();

    expect(session).toEqual({
      status: 'authenticated',
      user: { id: 'core-user-42', username: 'agents-user@example.com' },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://agents.example.com/api/auth/token/verify');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      headers: { Authorization: 'Bearer saved-agents-token' },
    });
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it('does not forward login credentials across an origin redirect', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://unexpected.example.net/collect' },
      })
    );
    const service = new AgentsAuthService({
      bootstrapSecret: 'bootstrap-secret',
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    const result = await service.login({
      baseUrl: 'https://agents.example.com',
      loginName: 'agents-user@example.com',
      password: 'must-not-leave-origin',
    });

    expect(result).toEqual({ success: false, code: 'contractError' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://agents.example.com/api/auth/login');
  });

  it.each([
    {
      name: 'Agents authentication rejection',
      response: new Response(JSON.stringify({ errorCode: 40001, message: 'invalid credentials' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
      expected: 'invalidCredentials',
    },
    {
      name: 'Agents server failure',
      response: new Response(null, { status: 503 }),
      expected: 'serverError',
    },
    {
      name: 'incompatible Agents response',
      response: new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      expected: 'contractError',
    },
  ])('categorizes $name without contacting Core', async ({ response, expected }) => {
    fetchMock.mockResolvedValue(response);
    const service = new AgentsAuthService({
      bootstrapSecret: 'bootstrap-secret',
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    const result = await service.login({
      baseUrl: 'https://agents.example.com',
      loginName: 'agents-user@example.com',
      password: 'password',
    });

    expect(result).toEqual({ success: false, code: expected });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('categorizes a failed Agents connection as a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const service = new AgentsAuthService({
      bootstrapSecret: 'bootstrap-secret',
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    await expect(
      service.login({
        baseUrl: 'https://agents.example.com',
        loginName: 'agents-user@example.com',
        password: 'password',
      })
    ).resolves.toEqual({ success: false, code: 'networkError' });
  });

  it.each([
    {
      name: 'unreachable Core',
      coreResponse: () => Promise.reject(new TypeError('fetch failed')),
      expected: 'networkError',
    },
    {
      name: 'Core server failure',
      coreResponse: () => Promise.resolve(new Response(null, { status: 503 })),
      expected: 'serverError',
    },
    {
      name: 'incompatible Core response',
      coreResponse: () =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: { unexpected: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        ),
      expected: 'contractError',
    },
  ])('categorizes $name during user projection', async ({ coreResponse, expected }) => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorCode: 0,
            responseBody: {
              uuid: 'agents-user-42',
              userName: 'agents-user@example.com',
              token: 'agents-token',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockImplementationOnce(coreResponse);
    const service = new AgentsAuthService({
      bootstrapSecret: 'bootstrap-secret',
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    await expect(
      service.login({
        baseUrl: 'https://agents.example.com',
        loginName: 'agents-user@example.com',
        password: 'password',
      })
    ).resolves.toEqual({ success: false, code: expected });
    expect(saveSessionMock).not.toHaveBeenCalled();
    expect(setCoreCookieMock).not.toHaveBeenCalled();
  });

  it('does not activate the Core cookie when secure credential persistence fails', async () => {
    saveSessionMock.mockRejectedValue(new Error('secure storage unavailable'));
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorCode: 0,
            responseBody: {
              uuid: 'agents-user-42',
              userName: 'agents-user@example.com',
              token: 'agents-token',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user_id: 'core-user-42',
              user_type: 'aionpro',
              external_user_id: 'opaque-external-id',
              session_generation: 0,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user: { id: 'core-user-42', username: 'agents-user@example.com' },
              session_generation: 0,
            },
          }),
          {
            status: 200,
            headers: { 'set-cookie': 'aionui-session=core-token; HttpOnly; Path=/; SameSite=Lax' },
          }
        )
      );
    const service = new AgentsAuthService({
      bootstrapSecret: 'bootstrap-secret',
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    const result = await service.login({
      baseUrl: 'https://agents.example.com',
      loginName: 'agents-user@example.com',
      password: 'password',
    });

    expect(result).toEqual({ success: false, code: 'serverError' });
    expect(setCoreCookieMock).not.toHaveBeenCalled();
  });

  it('revokes the Core projection and clears local credentials without calling Agents logout', async () => {
    loadSessionMock.mockResolvedValue({
      baseUrl: 'https://agents.example.com',
      token: 'saved-agents-token',
      userId: 'agents-user-42',
    });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { user_id: 'core-user-42', session_generation: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const service = new AgentsAuthService({
      bootstrapSecret: 'bootstrap-secret',
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    const session = await service.logout({ clearCoreSessionCookie: clearCoreCookieMock });

    expect(session).toEqual({ status: 'unauthenticated', user: null });
    expect(clearSessionMock).toHaveBeenCalledOnce();
    expect(clearCoreCookieMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:39123/api/auth/internal/external-sessions/revoke');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: expect.stringContaining('agents-v1-'),
    });
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('agents.example.com');
  });
});
