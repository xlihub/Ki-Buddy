import http from 'node:http';
import type { AddressInfo } from 'node:net';

export const MATRIX_TEST_USER = {
  email: 'ki-buddy-matrix@example.com',
  name: 'Ki-Buddy Matrix User',
  orgName: 'Ki-Buddy E2E',
  phone: '10086',
  roles: [{ name: 'member' }],
  token: 'ki-buddy-matrix-token',
  userName: 'ki-buddy-matrix',
  uuid: 'ki-buddy-matrix-user',
} as const;

export async function startMatrixAgentsServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((request, response) => {
    const isLogin = request.method === 'POST' && request.url === '/kagent/login';
    const isValidation = request.method === 'POST' && request.url === '/kagent/system/user/validateToken';
    const authenticated = request.headers.authorization === `Bearer ${MATRIX_TEST_USER.token}`;

    if (!isLogin && !isValidation) {
      response.writeHead(404).end();
      return;
    }
    if (isValidation && !authenticated) {
      response.writeHead(401).end();
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        errorCode: 0,
        responseBody: {
          ...MATRIX_TEST_USER,
          ...(isValidation ? { token: undefined } : {}),
        },
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
