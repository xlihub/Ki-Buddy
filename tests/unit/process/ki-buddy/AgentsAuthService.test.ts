/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
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
              name: 'Agents User',
              email: 'agents-user@example.com',
              phone: '13800138000',
              orgName: 'Kingsoft AI',
              roles: [
                { id: 'designer', name: '设计人员' },
                { id: 'reviewer', name: '审核人员' },
              ],
              token: 'agents-token',
              expiresIn: 7200,
              dify_access_token: 'must-not-reach-renderer',
              routes: [{ path: '/admin' }],
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
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
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
      loginName: '  agents-user@example.com  ',
      password: 'secret',
    });

    expect(result).toEqual({
      success: true,
      session: {
        status: 'authenticated',
        user: {
          id: 'core-user-42',
          username: 'agents-user@example.com',
          agents: {
            userId: 'agents-user-42',
            username: 'agents-user@example.com',
            displayName: 'Agents User',
            email: 'agents-user@example.com',
            phone: '13800138000',
            organization: 'Kingsoft AI',
            roles: ['设计人员', '审核人员'],
            deploymentUrl: 'https://agents.example.com',
          },
        },
      },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://agents.example.com/kagent/login');
    const loginRequest = fetchMock.mock.calls[0]?.[1];
    expect(loginRequest).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(loginRequest?.headers).toBeUndefined();
    expect(loginRequest?.body).toBeInstanceOf(FormData);
    const loginForm = loginRequest?.body as FormData;
    expect(loginForm.get('username')).toBe('agents-user@example.com');
    expect(bcrypt.compareSync('5ebe2294ecd0e0f08eab7690d2a6ee69', String(loginForm.get('password')))).toBe(true);
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
              name: 'Agents User',
              email: 'agents-user@example.com',
              orgName: 'Kingsoft AI',
              roles: [{ id: 'designer', name: '设计人员' }],
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
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
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
      user: {
        id: 'core-user-42',
        username: 'agents-user@example.com',
        agents: {
          userId: 'agents-user-42',
          username: 'agents-user@example.com',
          displayName: 'Agents User',
          email: 'agents-user@example.com',
          organization: 'Kingsoft AI',
          roles: ['设计人员'],
          deploymentUrl: 'https://agents.example.com',
        },
      },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://agents.example.com/kagent/system/user/validateToken');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      headers: { Authorization: 'Bearer saved-agents-token' },
    });
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it.each([
    ['rejected token', new Response(null, { status: 401 })],
    [
      'mismatched identity',
      new Response(
        JSON.stringify({
          errorCode: 0,
          responseBody: { uuid: 'different-agents-user', userName: 'other@example.com' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ),
    ],
  ])('requests renderer cleanup after restoring a %s', async (_scenario, response) => {
    loadSessionMock.mockResolvedValue({
      baseUrl: 'https://agents.example.com',
      token: 'invalid-agents-token',
      userId: 'agents-user-42',
    });
    fetchMock.mockResolvedValue(response);
    const service = new AgentsAuthService({
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    await expect(service.getSession()).resolves.toEqual({
      status: 'unauthenticated',
      user: null,
      cleanupRequired: true,
    });
    expect(clearSessionMock).toHaveBeenCalledOnce();
    expect(clearCoreCookieMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:39123/api/auth/internal/external-sessions/revoke');
  });

  it.each([
    {
      scenario: 'deployment',
      oldBaseUrl: 'https://old-agents.example.com',
      oldUserId: 'agents-user',
      newBaseUrl: 'https://new-agents.example.com',
      newUserId: 'agents-user',
    },
    {
      scenario: 'account',
      oldBaseUrl: 'https://agents.example.com',
      oldUserId: 'old-agents-user',
      newBaseUrl: 'https://agents.example.com',
      newUserId: 'new-agents-user',
    },
  ])(
    'revokes the old Core runtime before switching $scenario',
    async ({ oldBaseUrl, oldUserId, newBaseUrl, newUserId }) => {
      loadSessionMock.mockResolvedValue({
        baseUrl: oldBaseUrl,
        token: 'old-agents-token',
        userId: oldUserId,
      });
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              errorCode: 0,
              responseBody: {
                uuid: newUserId,
                userName: 'new-user@example.com',
                token: 'new-agents-token',
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true, data: { user_id: 'old-core-user', session_generation: 1 } }), {
            status: 200,
          })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                user_id: 'new-core-user',
                user_type: 'aionpro',
                external_user_id: 'new-projected-user',
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
                user: { id: 'new-core-user', username: 'new-user@example.com' },
                session_generation: 0,
              },
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
                'set-cookie': 'aionui-session=new-core-token; HttpOnly; Path=/; SameSite=Lax',
              },
            }
          )
        );
      const service = new AgentsAuthService({
        agentsFetch: fetchMock,
        bootstrapSecret: 'bootstrap-secret',
        clearCoreSession: clearCoreCookieMock,
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
          baseUrl: newBaseUrl,
          loginName: 'new-user@example.com',
          password: 'password',
        })
      ).resolves.toMatchObject({ success: true });

      expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:39123/api/auth/internal/external-sessions/revoke');
      expect(fetchMock.mock.calls[2]?.[0]).toEqual(expect.stringContaining('/api/auth/internal/external-users/'));
      expect(clearCoreCookieMock).toHaveBeenCalledOnce();
      expect(clearSessionMock).toHaveBeenCalledOnce();
      expect(saveSessionMock).toHaveBeenCalledWith({
        baseUrl: newBaseUrl,
        token: 'new-agents-token',
        userId: newUserId,
      });
    }
  );

  it('requests renderer cache cleanup when a switched identity fails Core projection', async () => {
    loadSessionMock.mockResolvedValue({
      baseUrl: 'https://old-agents.example.com',
      token: 'old-agents-token',
      userId: 'old-agents-user',
    });
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorCode: 0,
            responseBody: {
              uuid: 'new-agents-user',
              userName: 'new-user@example.com',
              token: 'new-agents-token',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { user_id: 'old-core-user', session_generation: 1 } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 500 }));
    const service = new AgentsAuthService({
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
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
        baseUrl: 'https://new-agents.example.com',
        loginName: 'new-user@example.com',
        password: 'password',
      })
    ).resolves.toEqual({ success: false, code: 'serverError', shouldClearCache: true });
    expect(clearCoreCookieMock).toHaveBeenCalledOnce();
  });

  it('fails closed before provisioning the new identity when revoking the old Core projection fails', async () => {
    loadSessionMock.mockResolvedValue({
      baseUrl: 'https://old-agents.example.com',
      token: 'old-agents-token',
      userId: 'old-agents-user',
    });
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorCode: 0,
            responseBody: {
              uuid: 'new-agents-user',
              userName: 'new-user@example.com',
              token: 'new-agents-token',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 500 }));
    const service = new AgentsAuthService({
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
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
        baseUrl: 'https://new-agents.example.com',
        loginName: 'new-user@example.com',
        password: 'password',
      })
    ).resolves.toEqual({ success: false, code: 'serverError', shouldClearCache: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(saveSessionMock).not.toHaveBeenCalled();
    expect(clearSessionMock).toHaveBeenCalledOnce();
    expect(clearCoreCookieMock).toHaveBeenCalledOnce();
  });

  it('does not forward login credentials across an origin redirect', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://unexpected.example.net/collect' },
      })
    );
    const service = new AgentsAuthService({
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
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
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://agents.example.com/kagent/login');
  });

  it.each([
    {
      name: 'Agents authentication rejection',
      response: new Response(JSON.stringify({ errorCode: 1, message: 'invalid credentials' }), {
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
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
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
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
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
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { user_id: 'core-user-42', session_generation: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    const service = new AgentsAuthService({
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
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

    expect(result).toEqual({ success: false, code: 'serverError', shouldClearCache: true });
    expect(setCoreCookieMock).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[3]?.[0]).toBe('http://127.0.0.1:39123/api/auth/internal/external-sessions/revoke');
    expect(clearCoreCookieMock).toHaveBeenCalledOnce();
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
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    const session = await service.logout();

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

  it('clears the Core runtime before reporting a credential cleanup failure', async () => {
    loadSessionMock.mockResolvedValue({
      baseUrl: 'https://agents.example.com',
      token: 'saved-agents-token',
      userId: 'agents-user-42',
    });
    clearSessionMock.mockRejectedValue(new Error('keychain denied deletion'));
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { user_id: 'core-user-42', session_generation: 1 } }), {
        status: 200,
      })
    );
    const service = new AgentsAuthService({
      agentsFetch: fetchMock,
      bootstrapSecret: 'bootstrap-secret',
      clearCoreSession: clearCoreCookieMock,
      credentialStore: {
        load: loadSessionMock,
        save: saveSessionMock,
        clear: clearSessionMock,
      },
      fetch: fetchMock,
      getCoreBaseUrl: () => 'http://127.0.0.1:39123',
      setCoreSessionCookie: setCoreCookieMock,
    });

    await expect(service.logout()).rejects.toThrow('keychain denied deletion');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(clearCoreCookieMock).toHaveBeenCalledOnce();
    await expect(service.getSession()).resolves.toEqual({ status: 'unauthenticated', user: null });
  });
});
