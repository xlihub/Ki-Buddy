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

const AGENTS_USER = {
  email: 'ki-buddy-e2e@example.com',
  name: 'Ki-Buddy E2E User',
  orgName: 'Ki-Buddy E2E',
  phone: '10086',
  roles: [{ name: 'member' }],
  token: 'ki-buddy-e2e-token',
  userName: 'ki-buddy-e2e',
  uuid: 'ki-buddy-e2e-user-15',
};

async function startFakeAgentsServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  let loginAttempts = 0;
  const server = http.createServer((request, response) => {
    const isLogin = request.method === 'POST' && request.url === '/kagent/login';
    const isValidation = request.method === 'POST' && request.url === '/kagent/system/user/validateToken';

    if (!isLogin && !isValidation) {
      response.writeHead(404).end();
      return;
    }

    if (isLogin && loginAttempts++ === 0) {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ errorCode: 401, responseBody: null }));
      return;
    }

    if (isValidation && request.headers.authorization !== `Bearer ${AGENTS_USER.token}`) {
      response.writeHead(401).end();
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        errorCode: 0,
        responseBody: isLogin ? AGENTS_USER : { ...AGENTS_USER, token: undefined },
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

  test('rejects invalid credentials, then projects the accepted login into Core CurrentUser', async ({ page }) => {
    const agents = await startFakeAgentsServer();

    try {
      await page
        .locator('#ki-buddy-opening-guide-title, input[autocomplete="username"]')
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      const skipGuide = page.getByRole('button', { name: /^(跳过|Skip)$/i });
      if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click();
      await page.locator('input[autocomplete="username"]').waitFor({ state: 'visible' });

      await page.locator('input[autocomplete="url"]').fill(agents.baseUrl);
      await page.locator('input[autocomplete="username"]').fill(AGENTS_USER.userName);
      await page.locator('input[autocomplete="current-password"]').fill('e2e-password');
      await page.getByRole('button', { name: /^(登录|Sign In)$/i }).click();

      await expect(page.getByText(/用户名或密码错误|Invalid username or password/i)).toBeVisible();
      await expect.poll(async () => (await readCoreCurrentUser(page)).status).toBe(401);

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
              username: AGENTS_USER.userName,
            },
          },
        });

      const firstCurrentUser = await readCoreCurrentUser(page);
      const secondCurrentUser = await readCoreCurrentUser(page);
      expect(firstCurrentUser.body.user?.id).not.toBe('system');
      expect(secondCurrentUser.body.user).toEqual(firstCurrentUser.body.user);
      await expect(page.locator('input[autocomplete="username"]')).toHaveCount(0);
      await expect(page.getByText(/暂无对话历史|No conversation history/i)).toBeVisible();
    } finally {
      await page.evaluate(() => window.electronAPI?.kiBuddyAuth?.logout()).catch(() => undefined);
      await agents.close();
    }
  });
});
