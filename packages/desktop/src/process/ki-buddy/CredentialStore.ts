import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { AgentsCredentialStore, StoredAgentsSession } from './AgentsAuthService';

function isStoredSession(value: unknown): value is StoredAgentsSession {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.baseUrl === 'string' && typeof record.token === 'string' && typeof record.userId === 'string';
}

function requireSecureStorage(): void {
  if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error('secure operating-system credential storage is unavailable');
  }
}

export class SafeStorageCredentialStore implements AgentsCredentialStore {
  private readonly sessionPath: string;

  constructor(userDataPath: string) {
    this.sessionPath = path.join(userDataPath, 'ki-buddy', 'agents-session.bin');
  }

  async load(): Promise<StoredAgentsSession | null> {
    requireSecureStorage();
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.sessionPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as unknown;
    if (!isStoredSession(parsed)) {
      throw new Error('stored Agents session has an incompatible shape');
    }
    return parsed;
  }

  async save(session: StoredAgentsSession): Promise<void> {
    requireSecureStorage();
    const directory = path.dirname(this.sessionPath);
    const temporaryPath = `${this.sessionPath}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, safeStorage.encryptString(JSON.stringify(session)), { mode: 0o600 });
    await rename(temporaryPath, this.sessionPath);
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.sessionPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
