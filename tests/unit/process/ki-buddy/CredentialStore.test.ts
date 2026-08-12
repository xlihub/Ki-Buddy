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
      'agents-session',
      'agents-fixed-token'
    );
    const metadataPath = path.join(userDataPath, 'ki-buddy', 'agents-session.json');
    const metadata = await readFile(metadataPath, 'utf8');
    expect(JSON.parse(metadata)).toEqual({
      schemaVersion: 1,
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

    expect(keytarMock.getPassword).toHaveBeenCalledWith(service, 'agents-session');
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
      'agents-session'
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
    expect(keytarMock.deletePassword).toHaveBeenCalledWith(service, 'agents-session');
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
      'agents-session',
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

  it('reports keytar cleanup failures after removing metadata', async () => {
    const store = createStore();
    await store.save({
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    });
    keytarMock.deletePassword.mockRejectedValueOnce(new Error('keychain denied deletion'));

    await expect(store.clear()).rejects.toThrow('keychain denied deletion');
    await expect(readFile(path.join(userDataPath, 'ki-buddy', 'agents-session.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  function createStore(storageNamespace?: string): KeytarCredentialStore {
    return new KeytarCredentialStore(userDataPath, {
      loadKeytar: () => Promise.resolve(keytarMock),
      storageNamespace,
    });
  }
});
