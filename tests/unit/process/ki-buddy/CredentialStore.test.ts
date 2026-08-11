/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeStorageMock = vi.hoisted(() => ({
  decryptString: vi.fn((value: Buffer) =>
    Buffer.from(value)
      .map((byte) => byte ^ 0xff)
      .toString('utf8')
  ),
  encryptString: vi.fn((value: string) => Buffer.from(value, 'utf8').map((byte) => byte ^ 0xff)),
  getSelectedStorageBackend: vi.fn(() => 'keychain'),
  isEncryptionAvailable: vi.fn(() => true),
}));

vi.mock('electron', () => ({ safeStorage: safeStorageMock }));

import { SafeStorageCredentialStore } from '@/process/ki-buddy/CredentialStore';

describe('SafeStorageCredentialStore', () => {
  let userDataPath: string;

  beforeEach(async () => {
    userDataPath = await mkdtemp(path.join(os.tmpdir(), 'ki-buddy-credentials-'));
    safeStorageMock.decryptString.mockClear();
    safeStorageMock.encryptString.mockClear();
    safeStorageMock.getSelectedStorageBackend.mockReturnValue('keychain');
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
  });

  afterEach(async () => {
    await rm(userDataPath, { recursive: true, force: true });
  });

  it('stores the Agents token encrypted with owner-only file permissions', async () => {
    const store = new SafeStorageCredentialStore(userDataPath);
    const saved = {
      baseUrl: 'https://agents.example.com',
      token: 'agents-fixed-token',
      userId: 'agents-user-42',
    };

    await store.save(saved);

    const sessionPath = path.join(userDataPath, 'ki-buddy', 'agents-session.bin');
    const bytes = await readFile(sessionPath);
    expect(bytes.toString('utf8')).not.toContain('agents-fixed-token');
    expect(await store.load()).toEqual(saved);
    expect(await readdir(path.dirname(sessionPath))).toEqual(['agents-session.bin']);
    if (process.platform !== 'win32') {
      expect((await stat(sessionPath)).mode & 0o777).toBe(0o600);
    }
  });

  it.each([
    { available: false, backend: 'keychain' },
    { available: true, backend: 'basic_text' },
  ])('refuses plaintext-compatible storage ($backend)', async ({ available, backend }) => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(available);
    safeStorageMock.getSelectedStorageBackend.mockReturnValue(backend);
    const store = new SafeStorageCredentialStore(userDataPath);

    await expect(
      store.save({
        baseUrl: 'https://agents.example.com',
        token: 'agents-fixed-token',
        userId: 'agents-user-42',
      })
    ).rejects.toThrow('secure operating-system credential storage is unavailable');
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });
});
