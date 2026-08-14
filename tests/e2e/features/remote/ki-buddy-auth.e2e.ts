import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
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
    name: 'Ki-Buddy Shared Visible Name',
    orgName: 'Ki-Buddy E2E',
    phone: '10086',
    roles: [{ name: 'member' }],
    token: 'ki-buddy-e2e-token-a',
    userName: 'ki-buddy-e2e-a',
    uuid: 'ki-buddy-e2e-user-15-a',
  },
  {
    email: 'ki-buddy-e2e-b@example.com',
    name: 'Ki-Buddy Shared Visible Name',
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
const BROWSER_SITE_COOKIE = 'ki-buddy-browser-session=preserved';
const BROWSER_SITE_STORAGE_KEY = 'ki-buddy-browser-storage';
const BROWSER_SITE_STORAGE_VALUE = 'preserved';

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
  options: {
    invalidLoginAttempts?: number;
    loginUserSequence?: readonly (typeof AGENTS_USERS)[number][];
    repeatFirstUser?: boolean;
  } = {}
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
    if (request.method === 'GET' && request.url === '/browser-state') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<title>Ki-Buddy Browser State</title><main>Read-only browser partition probe</main>');
      return;
    }

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
    const loginIndex = Math.max(loginAttempts - invalidLoginAttempts - 1, 0);
    const sequenceUser = options.loginUserSequence?.length
      ? options.loginUserSequence[Math.min(loginIndex, options.loginUserSequence.length - 1)]
      : undefined;
    const user = isLogin
      ? (sequenceUser ?? AGENTS_USERS[options.repeatFirstUser ? 0 : Math.min(loginIndex, 1)])
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

async function createCoreConversation(
  page: import('@playwright/test').Page,
  name: string,
  workspace = os.tmpdir()
): Promise<string> {
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
    { conversationName: name, workspace }
  );
}

type CoreConversationResponse = {
  success: boolean;
  data?: {
    id?: string;
    extra?: {
      workspace?: string;
    };
  };
};

async function readCoreConversation(
  page: import('@playwright/test').Page,
  conversationId: string
): Promise<{ body: CoreConversationResponse; status: number }> {
  return page.evaluate(async (id) => {
    const port = (window as Window & { __backendPort?: number }).__backendPort;
    if (!port) throw new Error('Ki-Core backend port is unavailable in the renderer');
    const response = await fetch(`http://127.0.0.1:${port}/api/conversations/${encodeURIComponent(id)}`, {
      credentials: 'include',
    });
    return {
      body: (await response.json()) as CoreConversationResponse,
      status: response.status,
    };
  }, conversationId);
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

async function loginThroughUi(
  page: import('@playwright/test').Page,
  params: { baseUrl: string; username: string }
): Promise<void> {
  await fillLoginForm(page, params);
  await page.getByRole('button', { name: /^(登录|Sign In)$/i }).click();
  await waitForLoginSuccess(page);
}

async function logoutThroughUi(page: import('@playwright/test').Page): Promise<void> {
  if (!/#\/settings\//.test(page.url())) {
    await page
      .locator('.sider-footer')
      .getByText(/^(设置|Settings)$/i)
      .click();
  }
  await page.locator('[data-settings-id="account"]').click();
  await expect(page).toHaveURL(/#\/settings\/account$/);
  try {
    await expect(page.getByTestId('ki-buddy-account-card')).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    const session = await page.evaluate(() => window.electronAPI?.kiBuddyAuth?.getSession()).catch(() => null);
    const visibleText = (await page.locator('body').innerText()).slice(0, 2_000);
    throw new Error(
      `Ki-Buddy account page did not render. Session: ${JSON.stringify(session)}. Visible text: ${visibleText}`,
      { cause: error }
    );
  }
  await page.getByTestId('ki-buddy-account-menu-button').click();
  await page.getByTestId('ki-buddy-account-logout-menu-item').click();
  const logoutModal = page.getByTestId('ki-buddy-account-logout-modal');
  await expect(logoutModal).toBeVisible();
  await logoutModal.getByRole('button', { name: /^(退出登录|Sign out)$/i }).click();
  await page.locator('input[autocomplete="username"]').waitFor({ state: 'visible' });
}

type PersistedBrowserTab = {
  content: string;
  content_type: string;
  id: string;
  title: string;
};

async function readPersistedBrowserTabs(page: import('@playwright/test').Page): Promise<PersistedBrowserTab[]> {
  return page.evaluate(() => {
    const tabs: PersistedBrowserTab[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('preview-ui:')) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as { tabs?: unknown };
        if (!Array.isArray(parsed.tabs)) continue;
        for (const value of parsed.tabs) {
          if (!value || typeof value !== 'object') continue;
          const tab = value as Partial<PersistedBrowserTab>;
          if (
            tab.content_type === 'browser' &&
            typeof tab.id === 'string' &&
            typeof tab.title === 'string' &&
            typeof tab.content === 'string'
          ) {
            tabs.push(tab as PersistedBrowserTab);
          }
        }
      } catch {
        // Corrupt preview state is not a valid browser tab.
      }
    }
    return tabs;
  });
}

async function openClientBrowserForConversation(
  page: import('@playwright/test').Page,
  conversationId: string,
  expectedUrl = 'about:blank'
): Promise<PersistedBrowserTab> {
  const conversation = page.locator(`#c-${conversationId}`);
  await expect(conversation).toBeVisible({ timeout: 30_000 });
  await conversation.click();
  await expect(page.locator('.workspace-open-button__dropdown-btn')).toBeVisible({ timeout: 30_000 });
  await page.locator('.workspace-open-button__dropdown-btn').click();
  await page
    .locator('.workspace-open-dropdown-item')
    .filter({ hasText: /^(浏览器|Browser)$/i })
    .click();
  await expect(page.locator('.aion-url-viewer-toolbar .toolbar-input')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await readPersistedBrowserTabs(page)).find((tab) => tab.content === expectedUrl), {
      timeout: 30_000,
    })
    .toMatchObject({
      content: expectedUrl,
      content_type: 'browser',
      id: expect.any(String),
      title: expect.any(String),
    });
  const browserTab = (await readPersistedBrowserTabs(page)).find((tab) => tab.content === expectedUrl);
  if (!browserTab) throw new Error('The client browser tab was not persisted');
  return browserTab;
}

async function restoreClientBrowserForConversation(
  page: import('@playwright/test').Page,
  conversationId: string,
  expectedTab: PersistedBrowserTab
): Promise<void> {
  const conversation = page.locator(`#c-${conversationId}`);
  await expect(conversation).toBeVisible({ timeout: 30_000 });
  await conversation.click();
  expect(await page.evaluate(() => localStorage.getItem('workspace-open-preference'))).toBe('browser');
  await page.locator('.workspace-open-button__btn').click();
  await page.locator(`span[title=${JSON.stringify(expectedTab.title)}]`).click();
  await expect(
    page.locator(`.aion-url-viewer-toolbar .toolbar-input[value=${JSON.stringify(expectedTab.content)}]`)
  ).toHaveCount(1, { timeout: 30_000 });
  expect(await readPersistedBrowserTabs(page)).toContainEqual(expectedTab);
}

async function navigateClientBrowser(
  page: import('@playwright/test').Page,
  tabId: string,
  targetUrl: string,
  expectedTitle: string
): Promise<PersistedBrowserTab> {
  const addressBar = page.locator('.aion-url-viewer-toolbar .toolbar-input');
  await addressBar.fill(targetUrl);
  await addressBar.press('Enter');
  await expect
    .poll(async () => (await readPersistedBrowserTabs(page)).find((tab) => tab.id === tabId), { timeout: 30_000 })
    .toMatchObject({ content: targetUrl, id: tabId, title: expectedTitle });
  const browserTab = (await readPersistedBrowserTabs(page)).find((tab) => tab.id === tabId);
  if (!browserTab) throw new Error('The navigated client browser tab was not persisted');
  await expect(page.locator('webview[partition="persist:aionui-browser"]')).toHaveCount(1);
  return browserTab;
}

type BrowserSiteState = {
  cookie: string;
  storageValue: string | null;
};

async function writeBrowserSiteState(page: import('@playwright/test').Page): Promise<BrowserSiteState> {
  return page.locator('webview[partition="persist:aionui-browser"]').evaluate(
    async (element, state) => {
      const webview = element as HTMLElement & {
        executeJavaScript: (script: string) => Promise<BrowserSiteState>;
      };
      return webview.executeJavaScript(`(() => {
        document.cookie = ${JSON.stringify(`${state.cookie}; Path=/; SameSite=Lax`)};
        localStorage.setItem(${JSON.stringify(state.storageKey)}, ${JSON.stringify(state.storageValue)});
        return {
          cookie: document.cookie,
          storageValue: localStorage.getItem(${JSON.stringify(state.storageKey)})
        };
      })()`);
    },
    {
      cookie: BROWSER_SITE_COOKIE,
      storageKey: BROWSER_SITE_STORAGE_KEY,
      storageValue: BROWSER_SITE_STORAGE_VALUE,
    }
  );
}

async function readBrowserSiteState(
  page: import('@playwright/test').Page,
  targetUrl: string
): Promise<BrowserSiteState> {
  return page
    .locator(`webview[partition="persist:aionui-browser"][src=${JSON.stringify(targetUrl)}]`)
    .evaluate(async (element, storageKey) => {
      const webview = element as HTMLElement & {
        executeJavaScript: (script: string) => Promise<BrowserSiteState>;
      };
      return webview.executeJavaScript(`({
        cookie: document.cookie,
        storageValue: localStorage.getItem(${JSON.stringify(storageKey)})
      })`);
    }, BROWSER_SITE_STORAGE_KEY);
}

async function readClientStorage(
  page: import('@playwright/test').Page,
  localKeys: string[],
  sessionKeys: string[]
): Promise<{ local: Record<string, string | null>; session: Record<string, string | null> }> {
  return page.evaluate(
    ({ localKeys: expectedLocalKeys, sessionKeys: expectedSessionKeys }) => ({
      local: Object.fromEntries(expectedLocalKeys.map((key) => [key, localStorage.getItem(key)])),
      session: Object.fromEntries(expectedSessionKeys.map((key) => [key, sessionStorage.getItem(key)])),
    }),
    { localKeys, sessionKeys }
  );
}

type BrowserDataClearCalls = {
  authCache: number;
  httpCache: number;
  storage: number;
};

async function trackBrowserDataClearCalls(electronApp: import('@playwright/test').ElectronApplication): Promise<void> {
  await electronApp.evaluate(async ({ session }, partition) => {
    const state = globalThis as typeof globalThis & {
      __kiBuddyBrowserDataClearCalls?: BrowserDataClearCalls;
    };
    const calls: BrowserDataClearCalls = { authCache: 0, httpCache: 0, storage: 0 };
    state.__kiBuddyBrowserDataClearCalls = calls;
    const browserSession = session.fromPartition(partition);
    const clearStorageData = browserSession.clearStorageData.bind(browserSession);
    const clearCache = browserSession.clearCache.bind(browserSession);
    const clearAuthCache = browserSession.clearAuthCache.bind(browserSession);
    browserSession.clearStorageData = async (options) => {
      calls.storage += 1;
      await clearStorageData(options);
    };
    browserSession.clearCache = async () => {
      calls.httpCache += 1;
      await clearCache();
    };
    browserSession.clearAuthCache = async () => {
      calls.authCache += 1;
      await clearAuthCache();
    };
  }, 'persist:aionui-browser');
}

async function readBrowserDataClearCalls(
  electronApp: import('@playwright/test').ElectronApplication
): Promise<BrowserDataClearCalls> {
  return electronApp.evaluate(async () => {
    const state = globalThis as typeof globalThis & {
      __kiBuddyBrowserDataClearCalls?: BrowserDataClearCalls;
    };
    return state.__kiBuddyBrowserDataClearCalls ?? { authCache: 0, httpCache: 0, storage: 0 };
  });
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

      await logoutThroughUi(page);

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

  test('uses Core user scope while preserving client storage, browser, and workspace semantics', async ({
    isolatedPackagedApp: electronApp,
    isolatedPackagedPage: page,
  }) => {
    const agents = await startFakeAgentsServer({
      loginUserSequence: [AGENTS_USER_A, AGENTS_USER_B, AGENTS_USER_A],
    });
    const projectWorkspace = await mkdtemp(path.join(os.tmpdir(), 'ki-buddy-account-workspace-'));
    let accountAConversationId: string | null = null;

    try {
      await trackBrowserDataClearCalls(electronApp);
      await page
        .locator('#ki-buddy-opening-guide-title, input[autocomplete="username"]')
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 });
      const skipGuide = page.getByRole('button', { name: /^(跳过|Skip)$/i });
      if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click();
      await page.locator('input[autocomplete="username"]').waitFor({ state: 'visible', timeout: 30_000 });

      await loginThroughUi(page, { baseUrl: agents.baseUrl, username: AGENTS_USER_A.userName });
      const accountACoreUser = await readCoreCurrentUser(page);
      expect(accountACoreUser).toMatchObject({
        status: 200,
        body: { user: { id: expect.any(String), username: AGENTS_USER_A.userName } },
      });
      accountAConversationId = await createCoreConversation(
        page,
        `E2E account A project ${Date.now()}`,
        projectWorkspace
      );
      expect(await readCoreConversation(page, accountAConversationId)).toMatchObject({
        status: 200,
        body: {
          data: {
            extra: { workspace: projectWorkspace },
          },
        },
      });
      const blankBrowserTab = await openClientBrowserForConversation(page, accountAConversationId);
      const browserPageUrl = `${agents.baseUrl}/browser-state`;
      const clientBrowserTab = await navigateClientBrowser(
        page,
        blankBrowserTab.id,
        browserPageUrl,
        'Ki-Buddy Browser State'
      );
      await expect
        .poll(() => writeBrowserSiteState(page), { timeout: 30_000 })
        .toEqual({ cookie: BROWSER_SITE_COOKIE, storageValue: BROWSER_SITE_STORAGE_VALUE });
      const clientStorage = {
        'aionui:recent-workspaces': JSON.stringify([{ path: projectWorkspace, name: 'Local client workspace' }]),
        'conversation.historySearch.recentKeywords': JSON.stringify(['client search history']),
        'explorer-ui:e2e-client-project': JSON.stringify({ expanded: ['src'], selected: 'src/index.ts' }),
        'team-section-expanded': 'false',
      };
      const clientSessionStorage = {
        'aion:last-non-settings-path': '/guid',
        'conversation-command-queue/e2e-client-conversation': JSON.stringify({ items: [{ input: 'client draft' }] }),
      };
      await page.evaluate(
        ({ localEntries, sessionEntries }) => {
          for (const [key, value] of Object.entries(localEntries)) localStorage.setItem(key, value);
          for (const [key, value] of Object.entries(sessionEntries)) sessionStorage.setItem(key, value);
        },
        { localEntries: clientStorage, sessionEntries: clientSessionStorage }
      );
      const expectedClientStorage = { local: clientStorage, session: clientSessionStorage };

      const accountADocumentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
      await logoutThroughUi(page);
      await loginThroughUi(page, { baseUrl: agents.baseUrl, username: AGENTS_USER_B.userName });
      await expect
        .poll(async () => page.evaluate(() => performance.timeOrigin), { timeout: 30_000 })
        .not.toBe(accountADocumentTimeOrigin);
      await expect(page).toHaveURL(/#\/guid$/);
      const accountBCoreUser = await readCoreCurrentUser(page);
      expect(accountBCoreUser).toMatchObject({
        status: 200,
        body: { user: { id: expect.any(String), username: AGENTS_USER_B.userName } },
      });
      expect(accountBCoreUser.body.user?.id).not.toBe(accountACoreUser.body.user?.id);
      expect(await readPersistedBrowserTabs(page)).toEqual([clientBrowserTab]);
      expect(await readClientStorage(page, Object.keys(clientStorage), Object.keys(clientSessionStorage))).toEqual(
        expectedClientStorage
      );
      expect((await readCoreConversation(page, accountAConversationId)).status).toBe(404);
      await expect(page.locator(`#c-${accountAConversationId}`)).toHaveCount(0);

      const accountBConversationId = await createCoreConversation(
        page,
        `E2E account B same project ${Date.now()}`,
        projectWorkspace
      );
      expect(await readCoreConversation(page, accountBConversationId)).toMatchObject({
        status: 200,
        body: {
          data: {
            extra: { workspace: projectWorkspace },
          },
        },
      });

      const accountBDocumentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
      await logoutThroughUi(page);
      await loginThroughUi(page, { baseUrl: agents.baseUrl, username: AGENTS_USER_A.userName });
      await expect
        .poll(async () => page.evaluate(() => performance.timeOrigin), { timeout: 30_000 })
        .not.toBe(accountBDocumentTimeOrigin);
      await expect(page).toHaveURL(/#\/guid$/);
      expect(await readCoreCurrentUser(page)).toMatchObject({
        status: 200,
        body: {
          user: {
            id: accountACoreUser.body.user?.id,
            username: AGENTS_USER_A.userName,
          },
        },
      });
      expect(await readPersistedBrowserTabs(page)).toEqual([clientBrowserTab]);
      expect(await readClientStorage(page, Object.keys(clientStorage), Object.keys(clientSessionStorage))).toEqual(
        expectedClientStorage
      );
      expect(await readCoreConversation(page, accountAConversationId)).toMatchObject({
        status: 200,
        body: {
          data: {
            extra: { workspace: projectWorkspace },
          },
        },
      });
      expect((await readCoreConversation(page, accountBConversationId)).status).toBe(404);
      await expect(page.locator(`#c-${accountAConversationId}`)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(`#c-${accountBConversationId}`)).toHaveCount(0);
      await restoreClientBrowserForConversation(page, accountAConversationId, clientBrowserTab);
      await expect
        .poll(() => readBrowserSiteState(page, browserPageUrl), { timeout: 30_000 })
        .toEqual({ cookie: BROWSER_SITE_COOKIE, storageValue: BROWSER_SITE_STORAGE_VALUE });
      expect(await readBrowserDataClearCalls(electronApp)).toEqual({ authCache: 0, httpCache: 0, storage: 0 });
    } finally {
      if (accountAConversationId) await deleteCoreConversation(page, accountAConversationId).catch(() => undefined);
      await page.evaluate(() => window.electronAPI?.kiBuddyAuth?.logout()).catch(() => undefined);
      await agents.close();
      await rm(projectWorkspace, { force: true, recursive: true });
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
