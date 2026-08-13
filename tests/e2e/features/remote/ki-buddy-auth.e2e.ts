import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import { test, expect } from '../../fixtures';

type CoreCurrentUserResponse = {
  success: boolean;
  user?: {
    id: string;
    username: string;
  };
};

const AGENTS_USERS = [
  {
    email: 'ki-buddy-e2e-a@example.com',
    name: 'Ki-Buddy E2E User A',
    orgName: 'Ki-Buddy E2E',
    phone: '10086',
    roles: [{ name: 'member' }],
    token: 'ki-buddy-e2e-token-a',
    userName: 'ki-buddy-e2e-a',
    uuid: 'ki-buddy-e2e-user-15-a',
  },
  {
    email: 'ki-buddy-e2e-b@example.com',
    name: 'Ki-Buddy E2E User B',
    orgName: 'Ki-Buddy E2E',
    phone: '10010',
    roles: [{ name: 'member' }],
    token: 'ki-buddy-e2e-token-b',
    userName: 'ki-buddy-e2e-b',
    uuid: 'ki-buddy-e2e-user-15-b',
  },
] as const;

const AGENTS_USER_A = AGENTS_USERS[0];
const AGENTS_USER_B = AGENTS_USERS[1];

function findUserByToken(authorization: string | undefined) {
  return AGENTS_USERS.find((user) => authorization === `Bearer ${user.token}`);
}

async function fillLoginForm(
  page: import('@playwright/test').Page,
  params: { baseUrl: string; username: string }
): Promise<void> {
  await page.locator('input[autocomplete="url"]').fill(params.baseUrl);
  await page.locator('input[autocomplete="username"]').fill(params.username);
  await page.locator('input[autocomplete="current-password"]').fill('e2e-password');
}

const COMMON_USER_FIELDS = {
  orgName: 'Ki-Buddy E2E',
  roles: [{ name: 'member' }],
};

async function startFakeAgentsServer(
  options: { invalidLoginAttempts?: number; repeatFirstUser?: boolean } = {}
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
  expireToken: (token: string) => void;
  getValidationRequestCount: () => number;
  restoreToken: (token: string) => void;
}> {
  const expiredTokens = new Set<string>();
  let loginAttempts = 0;
  let validationRequestCount = 0;
  const invalidLoginAttempts = options.invalidLoginAttempts ?? 0;
  const server = http.createServer((request, response) => {
    const isLogin = request.method === 'POST' && request.url === '/kagent/login';
    const isValidation = request.method === 'POST' && request.url === '/kagent/system/user/validateToken';

    if (!isLogin && !isValidation) {
      response.writeHead(404).end();
      return;
    }

    if (isLogin && loginAttempts++ < invalidLoginAttempts) {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ errorCode: 401, responseBody: null }));
      return;
    }

    if (isValidation) validationRequestCount += 1;
    const user = isLogin
      ? AGENTS_USERS[options.repeatFirstUser ? 0 : Math.min(loginAttempts - invalidLoginAttempts - 1, 1)]
      : findUserByToken(request.headers.authorization);
    if (!user) {
      response.writeHead(401).end();
      return;
    }
    if (isValidation && expiredTokens.has(user.token)) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ errorCode: 401, responseBody: null }));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        errorCode: 0,
        responseBody: isLogin
          ? { ...COMMON_USER_FIELDS, ...user }
          : { ...COMMON_USER_FIELDS, ...user, token: undefined },
      })
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    expireToken: (token) => expiredTokens.add(token),
    getValidationRequestCount: () => validationRequestCount,
    restoreToken: (token) => expiredTokens.delete(token),
  };
}

async function readCoreCurrentUser(page: import('@playwright/test').Page): Promise<{
  body: CoreCurrentUserResponse;
  status: number;
}> {
  return page.evaluate(async () => {
    const port = (window as Window & { __backendPort?: number }).__backendPort;
    if (!port) throw new Error('Ki-Core backend port is unavailable in the renderer');
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/user`, {
      credentials: 'include',
    });
    return {
      body: (await response.json()) as CoreCurrentUserResponse,
      status: response.status,
    };
  });
}

async function createCoreConversation(page: import('@playwright/test').Page, name: string): Promise<string> {
  return page.evaluate(
    async ({ conversationName, workspace }) => {
      const port = (window as Window & { __backendPort?: number }).__backendPort;
      if (!port) throw new Error('Ki-Core backend port is unavailable in the renderer');
      const baseUrl = `http://127.0.0.1:${port}`;
      const assistantsResponse = await fetch(`${baseUrl}/api/assistants`, { credentials: 'include' });
      if (!assistantsResponse.ok) {
        throw new Error(`GET /api/assistants failed with status ${assistantsResponse.status}`);
      }
      const assistantsBody = (await assistantsResponse.json()) as { data?: Array<{ id?: string }> };
      const assistantId = assistantsBody.data?.find((assistant) => assistant.id)?.id;
      if (!assistantId) throw new Error('Ki-Buddy E2E requires at least one Core assistant');
      const csrfToken = window.electronAPI?.kiBuddyCoreTransport?.csrfToken;
      if (!csrfToken) throw new Error('Ki-Buddy Core CSRF token is unavailable in the renderer');

      const response = await fetch(`${baseUrl}/api/conversations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          name: conversationName,
          assistant: { id: assistantId },
          extra: { workspace, custom_workspace: true, session_mode: 'default' },
        }),
      });
      if (!response.ok) {
        throw new Error(`POST /api/conversations failed with status ${response.status}: ${await response.text()}`);
      }
      const body = (await response.json()) as { data?: { id?: string } };
      if (!body.data?.id) throw new Error('POST /api/conversations returned no conversation id');
      return body.data.id;
    },
    { conversationName: name, workspace: os.tmpdir() }
  );
}

async function readCoreConversationStatus(
  page: import('@playwright/test').Page,
  conversationId: string
): Promise<number> {
  return page.evaluate(async (id) => {
    const port = (window as Window & { __backendPort?: number }).__backendPort;
    if (!port) throw new Error('Ki-Core backend port is unavailable in the renderer');
    const response = await fetch(`http://127.0.0.1:${port}/api/conversations/${encodeURIComponent(id)}`, {
      credentials: 'include',
    });
    return response.status;
  }, conversationId);
}

async function deleteCoreConversation(page: import('@playwright/test').Page, conversationId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const port = (window as Window & { __backendPort?: number }).__backendPort;
    if (!port) return;
    const csrfToken = window.electronAPI?.kiBuddyCoreTransport?.csrfToken;
    if (!csrfToken) return;
    await fetch(`http://127.0.0.1:${port}/api/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'x-csrf-token': csrfToken },
    }).catch(() => undefined);
  }, conversationId);
}

async function waitForLoginSuccess(page: import('@playwright/test').Page): Promise<void> {
  try {
    await expect(page.locator('input[autocomplete="username"]')).toHaveCount(0, { timeout: 30_000 });
  } catch (error) {
    const session = await page.evaluate(() => window.electronAPI?.kiBuddyAuth?.getSession()).catch(() => null);
    const visibleText = (await page.locator('body').innerText()).slice(0, 2_000);
    throw new Error(
      `Ki-Buddy login did not leave the login form. Session: ${JSON.stringify(session)}. Visible text: ${visibleText}`,
      { cause: error }
    );
  }
}

test.describe('Ki-Buddy packaged Agents authentication', () => {
  test.skip(process.env.E2E_PACKAGED !== '1', 'This acceptance seam requires the packaged Electron application.');
  test.setTimeout(240_000);

  test('rejects invalid Agents credentials without creating a Core user', async ({ page }) => {
    const agents = await startFakeAgentsServer({ invalidLoginAttempts: 1 });

    try {
      await page
        .locator('#ki-buddy-opening-guide-title, input[autocomplete="username"]')
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      const skipGuide = page.getByRole('button', { name: /^(跳过|Skip)$/i });
      if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click();
      await page.locator('input[autocomplete="username"]').waitFor({ state: 'visible' });

      await fillLoginForm(page, { baseUrl: agents.baseUrl, username: AGENTS_USER_A.userName });
      await page.getByRole('button', { name: /^(登录|Sign In)$/i }).click();

      await expect(page.getByText(/用户名或密码错误|Invalid username or password/i)).toBeVisible();
      await expect.poll(async () => (await readCoreCurrentUser(page)).status).toBe(401);
    } finally {
      await page.evaluate(() => window.electronAPI?.kiBuddyAuth?.logout()).catch(() => undefined);
      await agents.close();
    }
  });

  test('switches accounts without letting business 401 responses clear the second login', async ({ page }) => {
    const agents = await startFakeAgentsServer();

    try {
      await page
        .locator('#ki-buddy-opening-guide-title, input[autocomplete="username"]')
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      const skipGuide = page.getByRole('button', { name: /^(跳过|Skip)$/i });
      if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click();
      await page.locator('input[autocomplete="username"]').waitFor({ state: 'visible' });

      const loginDocumentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
      await fillLoginForm(page, { baseUrl: agents.baseUrl, username: AGENTS_USER_A.userName });
      await page.getByRole('button', { name: /^(登录|Sign In)$/i }).click();

      await expect(page).toHaveURL(/#\/guid$/);
      await expect
        .poll(async () => readCoreCurrentUser(page), { timeout: 30_000 })
        .toMatchObject({
          status: 200,
          body: {
            success: true,
            user: {
              id: expect.any(String),
              username: AGENTS_USER_A.userName,
            },
          },
        });

      const firstCurrentUser = await readCoreCurrentUser(page);
      const secondCurrentUser = await readCoreCurrentUser(page);
      expect(firstCurrentUser.body.user?.id).not.toBe('system');
      expect(secondCurrentUser.body.user).toEqual(firstCurrentUser.body.user);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(loginDocumentTimeOrigin);
      await expect(page.locator('input[autocomplete="username"]')).toHaveCount(0);
      await expect(page.getByText(/暂无对话历史|No conversation history/i)).toBeVisible();

      let releaseStaleRequest: (() => void) | undefined;
      let markStaleRequestStarted: (() => void) | undefined;
      const staleRequestStarted = new Promise<void>((resolve) => {
        markStaleRequestStarted = resolve;
      });
      const staleRequestRelease = new Promise<void>((resolve) => {
        releaseStaleRequest = resolve;
      });
      const staleRoutePattern = '**/api/settings/client?keys=acp.promptTimeout';
      await page.route(staleRoutePattern, async (route) => {
        markStaleRequestStarted?.();
        await staleRequestRelease;
        await route.fulfill({ status: 401, body: 'Unauthorized' }).catch(() => undefined);
      });

      await page.evaluate(() => {
        window.location.hash = '#/settings/system';
      });
      await staleRequestStarted;

      await page.evaluate(() => {
        window.location.hash = '#/settings/account';
      });
      await expect(page.getByTestId('ki-buddy-account-card')).toBeVisible();
      await page.getByTestId('ki-buddy-account-menu-button').click();
      await page.getByTestId('ki-buddy-account-logout-menu-item').click();
      const logoutModal = page.getByTestId('ki-buddy-account-logout-modal');
      await expect(logoutModal).toBeVisible();
      await logoutModal.getByRole('button', { name: /^(退出登录|Sign out)$/i }).click();
      await page.locator('input[autocomplete="username"]').waitFor({ state: 'visible' });

      await fillLoginForm(page, { baseUrl: agents.baseUrl, username: AGENTS_USER_B.userName });
      await page.getByRole('button', { name: /^(登录|Sign In)$/i }).click();

      await expect
        .poll(async () => readCoreCurrentUser(page), { timeout: 30_000 })
        .toMatchObject({
          status: 200,
          body: {
            success: true,
            user: {
              id: expect.any(String),
              username: AGENTS_USER_B.userName,
            },
          },
        });
      releaseStaleRequest?.();
      await page.unroute(staleRoutePattern);

      await expect(page).toHaveURL(/#\/guid$/);
      await expect
        .poll(async () => page.evaluate(() => performance.timeOrigin), { timeout: 30_000 })
        .not.toBe(loginDocumentTimeOrigin);
      const switchedCurrentUser = await readCoreCurrentUser(page);
      expect(switchedCurrentUser.body.user?.id).not.toBe(firstCurrentUser.body.user?.id);
      await expect(page.locator('input[autocomplete="username"]')).toHaveCount(0);
      await expect(page.getByText(/暂无对话历史|No conversation history/i)).toBeVisible();

      let markBusiness401Started: (() => void) | undefined;
      const business401Started = new Promise<void>((resolve) => {
        markBusiness401Started = resolve;
      });
      const business401RoutePattern = '**/api/settings/client?keys=preview.textSizeLimitMb';
      await page.route(business401RoutePattern, async (route) => {
        markBusiness401Started?.();
        await route.fulfill({ status: 401, body: 'Unauthorized' });
      });
      const business401Processed = page.waitForEvent('console', {
        predicate: (message) =>
          message.text().includes('[httpBridge] GET /api/settings/client?keys=preview.textSizeLimitMb → 401'),
      });
      await page.evaluate(() => {
        window.location.hash = '#/settings/system';
      });
      await business401Started;
      await business401Processed;
      await page.unroute(business401RoutePattern);

      await expect
        .poll(async () => readCoreCurrentUser(page))
        .toMatchObject({
          status: 200,
          body: { user: { username: AGENTS_USER_B.userName } },
        });
      await expect(page.locator('input[autocomplete="username"]')).toHaveCount(0);
    } finally {
      await page.evaluate(() => window.electronAPI?.kiBuddyAuth?.logout()).catch(() => undefined);
      await agents.close();
    }
  });

  test('ends the active session after trusted token expiry and preserves Core history', async ({
    isolatedPackagedPage: page,
  }) => {
    const agents = await startFakeAgentsServer({ repeatFirstUser: true });
    let conversationId: string | null = null;

    try {
      await page
        .locator('#ki-buddy-opening-guide-title, input[autocomplete="username"]')
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      const skipGuide = page.getByRole('button', { name: /^(跳过|Skip)$/i });
      if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click();
      await page.locator('input[autocomplete="username"]').waitFor({ state: 'visible', timeout: 30_000 });
      await fillLoginForm(page, { baseUrl: agents.baseUrl, username: AGENTS_USER_A.userName });
      await page.getByRole('button', { name: /^(登录|Sign In)$/i }).click();

      await waitForLoginSuccess(page);
      const initialCoreUser = await readCoreCurrentUser(page);
      expect(initialCoreUser).toMatchObject({
        status: 200,
        body: { user: { id: expect.any(String), username: AGENTS_USER_A.userName } },
      });
      conversationId = await createCoreConversation(page, `E2E trusted auth expiry ${Date.now()}`);
      expect(await readCoreConversationStatus(page, conversationId)).toBe(200);

      const validationCountBeforeExpiry = agents.getValidationRequestCount();
      agents.expireToken(AGENTS_USER_A.token);
      await expect
        .poll(() => agents.getValidationRequestCount(), {
          timeout: 75_000,
          message: 'Waiting for the packaged main process to validate the active Agents token',
        })
        .toBeGreaterThan(validationCountBeforeExpiry);

      await page.locator('input[autocomplete="username"]').waitFor({ state: 'visible', timeout: 30_000 });
      expect((await readCoreCurrentUser(page)).status).toBe(401);
      expect(await readCoreConversationStatus(page, conversationId)).toBe(401);

      agents.restoreToken(AGENTS_USER_A.token);
      await fillLoginForm(page, { baseUrl: agents.baseUrl, username: AGENTS_USER_A.userName });
      await page.getByRole('button', { name: /^(登录|Sign In)$/i }).click();

      await waitForLoginSuccess(page);
      expect(await readCoreCurrentUser(page)).toMatchObject({
        status: 200,
        body: {
          user: {
            id: initialCoreUser.body.user?.id,
            username: AGENTS_USER_A.userName,
          },
        },
      });
      expect(await readCoreConversationStatus(page, conversationId)).toBe(200);
      await expect(page.locator(`#c-${conversationId}`)).toBeVisible({ timeout: 30_000 });
    } finally {
      if (conversationId) await deleteCoreConversation(page, conversationId).catch(() => undefined);
      await page.evaluate(() => window.electronAPI?.kiBuddyAuth?.logout()).catch(() => undefined);
      await agents.close();
    }
  });
});
