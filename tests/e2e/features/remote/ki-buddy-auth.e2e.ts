import http from 'node:http';
import type { AddressInfo } from 'node:net';
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

async function startFakeAgentsServer(options: { invalidLoginAttempts?: number } = {}): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  let loginAttempts = 0;
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

    const user = isLogin
      ? AGENTS_USERS[Math.min(loginAttempts - invalidLoginAttempts - 1, 1)]
      : findUserByToken(request.headers.authorization);
    if (!user) {
      response.writeHead(401).end();
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

test.describe('Ki-Buddy packaged Agents authentication', () => {
  test.skip(process.env.E2E_PACKAGED !== '1', 'This acceptance seam requires the packaged Electron application.');
  test.setTimeout(120_000);

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
});
