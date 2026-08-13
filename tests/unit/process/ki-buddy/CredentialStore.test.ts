/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeytarCredentialStore } from '@/process/ki-buddy/CredentialStore';

const keytarMock = {
  deletePassword: vi.fn<(service: string, account: string) => Promise<boolean>>(),
  findCredentials: vi.fn<(service: string) => Promise<Array<{ account: string; password: string }>>>(),
  getPassword: vi.fn<(service: string, account: string) => Promise<string | null>>(),
  setPassword: vi.fn<(service: string, account: string, password: string) => Promise<void>>(),
};

describe('KeytarCredentialStore', () => {
  let userDataPath: string;

  beforeEach(async () => {
    vi.stubEnv('AIONUI_AUTH_STORAGE_NAMESPACE', '');
    userDataPath = await mkdtemp(path.join(os.tmpdir(), 'ki-buddy-credentials-'));
    keytarMock.deletePassword.mockReset();
    keytarMock.deletePassword.mockResolvedValue(true);
    keytarMock.getPassword.mockReset();
    keytarMock.getPassword.mockResolvedValue('agents-fixed-token');
    keytarMock.findCredentials.mockReset();
    keytarMock.findCredentials.mockResolvedValue([]);
    keytarMock.setPassword.mockReset();
    keytarMock.setPassword.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(userDataPath, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('stores the token in keytar and only non-sensitive identity metadata on disk', async () => {
    const store = createStore();
    const saved = {
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    };

    await store.save(saved);

    expect(keytarMock.setPassword).toHaveBeenCalledWith(
      expect.stringMatching(/^Ki-Buddy Agents \(profile-[a-f0-9]{16}\)$/),
      expect.stringMatching(/^agents-session-v2:[a-f0-9]{64}$/),
      'agents-fixed-token'
    );
    const metadataPath = path.join(userDataPath, 'ki-buddy', 'agents-session.json');
    const metadata = await readFile(metadataPath, 'utf8');
    expect(JSON.parse(metadata)).toEqual({
      schemaVersion: 2,
      baseUrl: 'https://agents.example.com',
      userId: 'agents-user-42',
    });
    expect(metadata).not.toContain('agents-fixed-token');
    if (process.platform !== 'win32') {
      expect((await stat(metadataPath)).mode & 0o777).toBe(0o600);
    }
  });

  it('loads identity metadata before retrieving its token from keytar', async () => {
    const store = createStore();
    const saved = {
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    };
    await store.save(saved);
    const service = keytarMock.setPassword.mock.calls[0]?.[0];
    keytarMock.setPassword.mockClear();

    await expect(store.load()).resolves.toEqual(saved);

    expect(keytarMock.getPassword).toHaveBeenCalledWith(
      service,
      expect.stringMatching(/^agents-session-v2:[a-f0-9]{64}$/)
    );
  });

  it('restores credentials written by the issue 15 storage format', async () => {
    const metadataDirectory = path.join(userDataPath, 'ki-buddy');
    await mkdir(metadataDirectory, { recursive: true });
    await writeFile(
      path.join(metadataDirectory, 'agents-session.json'),
      JSON.stringify({
        schemaVersion: 1,
        baseUrl: 'https://agents.example.com',
        userId: 'agents-user-42',
      })
    );
    const store = createStore();

    await expect(store.load()).resolves.toEqual({
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    });
    expect(keytarMock.getPassword).toHaveBeenCalledWith(expect.any(String), 'agents-session');
    expect(keytarMock.setPassword).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/^agents-session-v2:[a-f0-9]{64}$/),
      'agents-fixed-token'
    );
    expect(keytarMock.deletePassword).toHaveBeenCalledWith(expect.any(String), 'agents-session');
  });

  it('uses different operating-system credential accounts for each deployment and Agents user', async () => {
    const store = createStore();

    await store.save({
      baseUrl: 'https://agents.example.com',
      token: 'first-token',
      userId: 'agents-user-a',
    });
    await store.save({
      baseUrl: 'https://agents.example.com',
      token: 'second-token',
      userId: 'agents-user-b',
    });
    await store.save({
      baseUrl: 'https://other-agents.example.com',
      token: 'third-token',
      userId: 'agents-user-b',
    });

    const accounts = keytarMock.setPassword.mock.calls.map(([, account]) => account);
    expect(new Set(accounts)).toHaveProperty('size', 3);
    expect(keytarMock.deletePassword).toHaveBeenCalledWith(expect.any(String), accounts[0]);
    expect(keytarMock.deletePassword).toHaveBeenCalledWith(expect.any(String), accounts[1]);
  });

  it('removes orphaned identity credentials before making a new account current', async () => {
    const orphanedAccount = `agents-session-v2:${'b'.repeat(64)}`;
    keytarMock.findCredentials.mockResolvedValue([{ account: orphanedAccount, password: 'orphaned-token' }]);
    const store = createStore();

    await store.save({
      baseUrl: 'https://agents.example.com',
      token: 'current-token',
      userId: 'current-user',
    });

    expect(keytarMock.deletePassword).toHaveBeenCalledWith(expect.any(String), orphanedAccount);
  });

  it('fails closed without writing metadata when keytar is unavailable', async () => {
    const store = new KeytarCredentialStore(userDataPath, {
      loadKeytar: () => Promise.reject(new Error('native module unavailable')),
    });

    await expect(
      store.save({
        baseUrl: 'https://agents.example.com',
        token: 'agents-fixed-token',
        userId: 'agents-user-42',
      })
    ).rejects.toThrow('secure operating-system credential storage is unavailable');

    await expect(readdir(path.join(userDataPath, 'ki-buddy'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rolls back the keytar entry when metadata persistence fails', async () => {
    const blockedDirectory = path.join(userDataPath, 'ki-buddy');
    await writeFile(blockedDirectory, 'not-a-directory');
    const store = createStore();

    await expect(
      store.save({
        baseUrl: 'https://agents.example.com',
        token: 'agents-fixed-token',
        userId: 'agents-user-42',
      })
    ).rejects.toMatchObject({ code: expect.stringMatching(/ENOTDIR|EEXIST/) });

    expect(keytarMock.deletePassword).toHaveBeenCalledWith(
      expect.stringMatching(/^Ki-Buddy Agents \(profile-[a-f0-9]{16}\)$/),
      expect.stringMatching(/^agents-session-v2:[a-f0-9]{64}$/)
    );
  });

  it('removes both metadata and the matching keytar entry', async () => {
    const store = createStore();
    await store.save({
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    });
    const service = keytarMock.setPassword.mock.calls[0]?.[0];
    keytarMock.deletePassword.mockClear();

    await store.clear();

    await expect(readFile(path.join(userDataPath, 'ki-buddy', 'agents-session.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(keytarMock.deletePassword).toHaveBeenCalledWith(
      service,
      expect.stringMatching(/^agents-session-v2:[a-f0-9]{64}$/)
    );
  });

  it('isolates test credentials with the configured storage namespace', async () => {
    const store = createStore('smoke-001');

    await store.save({
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    });

    expect(keytarMock.setPassword).toHaveBeenCalledWith(
      'Ki-Buddy Agents (smoke-001)',
      expect.stringMatching(/^agents-session-v2:[a-f0-9]{64}$/),
      'agents-fixed-token'
    );
  });

  it('isolates default credentials between app data profiles', async () => {
    const otherProfilePath = path.join(userDataPath, 'other-profile');
    const primaryStore = createStore();
    const otherStore = new KeytarCredentialStore(otherProfilePath, {
      loadKeytar: () => Promise.resolve(keytarMock),
    });

    await primaryStore.save({
      baseUrl: 'https://agents.example.com',
      token: 'primary-token',
      userId: 'primary-user',
    });
    await otherStore.save({
      baseUrl: 'https://agents.example.com',
      token: 'other-token',
      userId: 'other-user',
    });

    const [primaryService, otherService] = keytarMock.setPassword.mock.calls.map(([service]) => service);
    expect(primaryService).not.toBe(otherService);
  });

  it('ignores incompatible metadata without querying keytar', async () => {
    const metadataDirectory = path.join(userDataPath, 'ki-buddy');
    await mkdir(metadataDirectory, { recursive: true });
    await writeFile(
      path.join(metadataDirectory, 'agents-session.json'),
      JSON.stringify({ schemaVersion: 99, baseUrl: 'https://agents.example.com', userId: 'agents-user-42' })
    );
    const store = createStore();

    await expect(store.load()).resolves.toBeNull();

    expect(keytarMock.getPassword).not.toHaveBeenCalled();
  });

  it('clears the stable keytar account even when metadata is incompatible', async () => {
    const metadataDirectory = path.join(userDataPath, 'ki-buddy');
    await mkdir(metadataDirectory, { recursive: true });
    await writeFile(path.join(metadataDirectory, 'agents-session.json'), JSON.stringify({ schemaVersion: 99 }));
    const store = createStore();

    await store.clear();

    expect(keytarMock.deletePassword).toHaveBeenCalledWith(
      expect.stringMatching(/^Ki-Buddy Agents \(profile-[a-f0-9]{16}\)$/),
      'agents-session'
    );
  });

  it('clears identity-bound credentials even when session metadata is damaged', async () => {
    const metadataDirectory = path.join(userDataPath, 'ki-buddy');
    await mkdir(metadataDirectory, { recursive: true });
    await writeFile(path.join(metadataDirectory, 'agents-session.json'), '{invalid json');
    keytarMock.findCredentials.mockResolvedValue([
      { account: `agents-session-v2:${'a'.repeat(64)}`, password: 'must-not-be-logged' },
      { account: 'unrelated-account', password: 'unrelated-password' },
    ]);
    const store = createStore();

    await store.clear();

    expect(keytarMock.deletePassword).toHaveBeenCalledWith(expect.any(String), `agents-session-v2:${'a'.repeat(64)}`);
    expect(keytarMock.deletePassword).not.toHaveBeenCalledWith(expect.any(String), 'unrelated-account');
  });

  it('preserves metadata when keytar cleanup fails so a later startup can retry', async () => {
    const store = createStore();
    await store.save({
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    });
    keytarMock.deletePassword.mockRejectedValueOnce(new Error('keychain denied deletion'));

    await expect(store.clear()).rejects.toThrow('keychain denied deletion');
    await expect(readFile(path.join(userDataPath, 'ki-buddy', 'agents-session.cleanup-pending'), 'utf8')).resolves.toBe(
      '{"schemaVersion":1}'
    );
  });

  it('prevents credential recovery when the cleanup marker and keytar deletion both fail', async () => {
    const store = createStore();
    await store.save({
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    });
    const metadataPath = path.join(userDataPath, 'ki-buddy', 'agents-session.json');
    const cleanupTombstonePath = path.join(userDataPath, 'ki-buddy', 'agents-session.cleanup-pending');
    const account = keytarMock.setPassword.mock.calls[0]?.[1];
    if (!account) throw new Error('credential account was not recorded');
    await mkdir(cleanupTombstonePath);
    keytarMock.findCredentials.mockResolvedValue([{ account, password: 'agents-fixed-token' }]);
    keytarMock.deletePassword.mockImplementation(async (_service, candidate) => {
      if (candidate === account) throw new Error('keychain denied deletion');
      return true;
    });

    await expect(store.clear()).rejects.toThrow('keychain denied deletion');
    await expect(readFile(metadataPath)).rejects.toMatchObject({ code: 'ENOENT' });

    await rm(cleanupTombstonePath, { recursive: true, force: true });
    keytarMock.getPassword.mockClear();
    await expect(createStore().load()).resolves.toBeNull();
    expect(keytarMock.getPassword).not.toHaveBeenCalled();
  });

  it('can retry identity-bound credential cleanup after a keytar failure', async () => {
    const store = createStore();
    await store.save({
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    });
    const account = keytarMock.setPassword.mock.calls[0]?.[1];
    if (!account) throw new Error('credential account was not recorded');
    keytarMock.findCredentials.mockResolvedValue([{ account, password: 'agents-fixed-token' }]);
    keytarMock.deletePassword.mockImplementation(async (_service, candidate) => {
      if (candidate === account) throw new Error('keychain denied deletion');
      return true;
    });

    await expect(store.clear()).rejects.toThrow('keychain denied deletion');

    keytarMock.deletePassword.mockResolvedValue(true);
    await expect(createStore().load()).resolves.toBeNull();
    expect(keytarMock.deletePassword.mock.calls.filter(([, candidate]) => candidate === account)).toHaveLength(2);
    await expect(readFile(path.join(userDataPath, 'ki-buddy', 'agents-session.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('retries cleanup on startup when damaged metadata and keytar deletion fail together', async () => {
    const metadataDirectory = path.join(userDataPath, 'ki-buddy');
    const account = `agents-session-v2:${'a'.repeat(64)}`;
    await mkdir(metadataDirectory, { recursive: true });
    await writeFile(path.join(metadataDirectory, 'agents-session.json'), '{invalid json');
    keytarMock.findCredentials.mockResolvedValue([{ account, password: 'must-not-be-logged' }]);
    keytarMock.deletePassword.mockImplementation(async (_service, candidate) => {
      if (candidate === account) throw new Error('keychain denied deletion');
      return true;
    });
    const store = createStore();

    await expect(store.clear()).rejects.toThrow('keychain denied deletion');

    keytarMock.deletePassword.mockResolvedValue(true);
    await expect(createStore().load()).resolves.toBeNull();
    expect(keytarMock.deletePassword.mock.calls.filter(([, candidate]) => candidate === account)).toHaveLength(2);
    await expect(readFile(path.join(metadataDirectory, 'agents-session.cleanup-pending'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('removes a stale cleanup tombstone after a new login saves credentials', async () => {
    const store = createStore();
    const initial = {
      baseUrl: 'https://agents.example.com',
      token: 'old-agents-token',
      userId: 'agents-user-42',
    };
    await store.save(initial);
    const account = keytarMock.setPassword.mock.calls[0]?.[1];
    if (!account) throw new Error('credential account was not recorded');
    keytarMock.findCredentials.mockResolvedValue([{ account, password: initial.token }]);
    keytarMock.deletePassword.mockImplementation(async (_service, candidate) => {
      if (candidate === account) throw new Error('keychain denied deletion');
      return true;
    });
    await expect(store.clear()).rejects.toThrow('keychain denied deletion');

    keytarMock.deletePassword.mockResolvedValue(true);
    keytarMock.getPassword.mockResolvedValue('new-agents-token');
    const replacement = { ...initial, token: 'new-agents-token' };
    await store.save(replacement);

    await expect(createStore().load()).resolves.toEqual(replacement);
    await expect(readFile(path.join(userDataPath, 'ki-buddy', 'agents-session.cleanup-pending'))).rejects.toMatchObject(
      { code: 'ENOENT' }
    );
  });

  function createStore(storageNamespace?: string): KeytarCredentialStore {
    return new KeytarCredentialStore(userDataPath, {
      loadKeytar: () => Promise.resolve(keytarMock),
      storageNamespace,
    });
  }
});
