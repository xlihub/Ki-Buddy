import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { normalizeAgentsBaseUrl } from '@/common/platform/ki-buddy';
import type { AgentsCredentialStore, StoredAgentsSession } from './AgentsAuthService';

const CREDENTIAL_METADATA_SCHEMA_VERSION = 2;
const LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION = 1;
const DEFAULT_KEYTAR_SERVICE = 'Ki-Buddy Agents';
const LEGACY_KEYTAR_ACCOUNT = 'agents-session';
const STORAGE_UNAVAILABLE_MESSAGE = 'secure operating-system credential storage is unavailable';

type CredentialMetadata = {
  schemaVersion: typeof CREDENTIAL_METADATA_SCHEMA_VERSION | typeof LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION;
  baseUrl: string;
  userId: string;
};

type KeytarApi = {
  findCredentials: (service: string) => Promise<Array<{ account: string; password: string }>>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

type KeytarCredentialStoreOptions = {
  loadKeytar?: () => Promise<KeytarApi>;
  storageNamespace?: string;
};

let keytarPromise: Promise<KeytarApi> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKeytarApi(value: unknown): value is KeytarApi {
  return (
    isRecord(value) &&
    typeof value.findCredentials === 'function' &&
    typeof value.getPassword === 'function' &&
    typeof value.setPassword === 'function' &&
    typeof value.deletePassword === 'function'
  );
}

async function loadSystemKeytar(): Promise<KeytarApi> {
  if (!keytarPromise) {
    keytarPromise = import('keytar')
      .then((module) => {
        const candidate = 'default' in module ? module.default : module;
        if (!isKeytarApi(candidate)) {
          throw new Error('keytar did not expose the expected credential API');
        }
        return candidate;
      })
      .catch((error: unknown) => {
        console.warn('[Ki-Buddy Auth] keytar is unavailable', error);
        throw new Error(STORAGE_UNAVAILABLE_MESSAGE, { cause: error });
      });
  }
  return keytarPromise;
}

function keytarService(namespace: string | undefined): string {
  const normalized = namespace?.trim();
  return normalized ? `${DEFAULT_KEYTAR_SERVICE} (${normalized})` : DEFAULT_KEYTAR_SERVICE;
}

function resolveStorageNamespace(userDataPath: string, configuredNamespace: string | undefined): string {
  const normalized = configuredNamespace?.trim();
  if (normalized) return normalized;
  const profileDigest = createHash('sha256').update(path.resolve(userDataPath), 'utf8').digest('hex').slice(0, 16);
  return `profile-${profileDigest}`;
}

function parseMetadata(value: unknown): CredentialMetadata | null {
  if (!isRecord(value)) return null;
  const baseUrl = normalizeAgentsBaseUrl(value.baseUrl);
  if (
    (value.schemaVersion !== CREDENTIAL_METADATA_SCHEMA_VERSION &&
      value.schemaVersion !== LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION) ||
    !baseUrl ||
    value.baseUrl !== baseUrl ||
    typeof value.userId !== 'string' ||
    value.userId.trim() === '' ||
    value.userId !== value.userId.trim()
  ) {
    return null;
  }
  return {
    schemaVersion: value.schemaVersion,
    baseUrl,
    userId: value.userId,
  };
}

function credentialAccount(metadata: CredentialMetadata): string {
  if (metadata.schemaVersion === LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION) return LEGACY_KEYTAR_ACCOUNT;
  const identityDigest = createHash('sha256')
    .update(JSON.stringify([metadata.baseUrl, metadata.userId]), 'utf8')
    .digest('hex');
  return `agents-session-v2:${identityDigest}`;
}

function createMetadata(session: StoredAgentsSession): CredentialMetadata {
  const baseUrl = normalizeAgentsBaseUrl(session.baseUrl);
  const userId = session.userId.trim();
  if (!baseUrl || baseUrl !== session.baseUrl || !userId || userId !== session.userId) {
    throw new Error('Agents credential identity must use a normalized deployment URL and stable user identifier');
  }
  return { schemaVersion: CREDENTIAL_METADATA_SCHEMA_VERSION, baseUrl, userId };
}

/** Persists Agents tokens in the operating-system credential manager and non-sensitive identity metadata on disk. */
export class KeytarCredentialStore implements AgentsCredentialStore {
  private readonly cleanupTombstonePath: string;
  private readonly metadataPath: string;
  private readonly loadKeytar: () => Promise<KeytarApi>;
  private readonly service: string;

  /** Creates a credential store scoped to the current app profile and optional test namespace. */
  constructor(userDataPath: string, options: KeytarCredentialStoreOptions = {}) {
    this.metadataPath = path.join(userDataPath, 'ki-buddy', 'agents-session.json');
    this.cleanupTombstonePath = path.join(userDataPath, 'ki-buddy', 'agents-session.cleanup-pending');
    this.loadKeytar = options.loadKeytar ?? loadSystemKeytar;
    this.service = keytarService(
      resolveStorageNamespace(userDataPath, options.storageNamespace ?? process.env.AIONUI_AUTH_STORAGE_NAMESPACE)
    );
  }

  /** Loads identity metadata first and resolves its token from the operating-system credential manager. */
  async load(): Promise<StoredAgentsSession | null> {
    if (await this.hasCleanupTombstone()) {
      await this.clear();
      return null;
    }
    const metadata = await this.readMetadata();
    if (!metadata) return null;

    const keytar = await this.requireKeytar();
    let token: string | null;
    try {
      token = await keytar.getPassword(this.service, credentialAccount(metadata));
    } catch (error) {
      console.warn('[Ki-Buddy Auth] Failed to load the Agents token from keytar', error);
      throw error;
    }
    if (typeof token !== 'string' || token.trim() === '') {
      return null;
    }
    const stored = { baseUrl: metadata.baseUrl, token, userId: metadata.userId };
    if (metadata.schemaVersion === LEGACY_CREDENTIAL_METADATA_SCHEMA_VERSION) await this.save(stored);
    return stored;
  }

  /** Saves the token before atomically writing metadata, rolling the credential back if the file write fails. */
  async save(session: StoredAgentsSession): Promise<void> {
    const keytar = await this.requireKeytar();
    const metadata = createMetadata(session);
    const nextAccount = credentialAccount(metadata);
    const previousMetadata = await this.readMetadata();
    const previousAccount = previousMetadata ? credentialAccount(previousMetadata) : LEGACY_KEYTAR_ACCOUNT;
    const accountsToRemove = new Set([LEGACY_KEYTAR_ACCOUNT, previousAccount]);
    const existingCredentials = await keytar.findCredentials(this.service);
    existingCredentials.forEach(({ account }) => {
      if (account.startsWith('agents-session-v2:')) accountsToRemove.add(account);
    });
    const previousToken =
      previousAccount === nextAccount ? await keytar.getPassword(this.service, previousAccount) : null;
    try {
      await keytar.setPassword(this.service, nextAccount, session.token);
    } catch (error) {
      console.warn('[Ki-Buddy Auth] Failed to save the Agents token to keytar', error);
      throw error;
    }

    const directory = path.dirname(this.metadataPath);
    const temporaryPath = `${this.metadataPath}.${process.pid}.tmp`;
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, JSON.stringify(metadata), { mode: 0o600 });
      await rename(temporaryPath, this.metadataPath);
    } catch (error) {
      console.warn('[Ki-Buddy Auth] Failed to save Agents session metadata', error);
      await unlink(temporaryPath).catch(() => {});
      await keytar.deletePassword(this.service, nextAccount).catch((cleanupError: unknown) => {
        console.warn('[Ki-Buddy Auth] Failed to roll back the Agents token from keytar', cleanupError);
        return false;
      });
      if (previousToken) {
        await keytar.setPassword(this.service, previousAccount, previousToken).catch((cleanupError: unknown) => {
          console.warn('[Ki-Buddy Auth] Failed to restore the previous Agents token in keytar', cleanupError);
        });
      }
      throw error;
    }
    const removalResults = await Promise.allSettled(
      [...accountsToRemove]
        .filter((account) => account !== nextAccount)
        .map((account) => keytar.deletePassword(this.service, account))
    );
    const failedRemoval = removalResults.find((result) => result.status === 'rejected');
    if (failedRemoval?.status === 'rejected') {
      console.warn('[Ki-Buddy Auth] Failed to remove a previous Agents token from keytar', failedRemoval.reason);
      throw failedRemoval.reason;
    }
    await unlink(this.cleanupTombstonePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  /** Removes both local identity metadata and the corresponding operating-system credential. */
  async clear(): Promise<void> {
    let credentialCleanupError: unknown;
    let metadata: CredentialMetadata | null = null;
    try {
      metadata = await this.readMetadata();
    } catch (error) {
      console.warn('[Ki-Buddy Auth] Failed to read Agents session metadata during cleanup', error);
    }
    try {
      await this.writeCleanupTombstone();
    } catch (error) {
      console.warn('[Ki-Buddy Auth] Failed to mark Agents credential cleanup as pending', error);
      try {
        await unlink(this.metadataPath);
      } catch (metadataError) {
        if ((metadataError as NodeJS.ErrnoException).code !== 'ENOENT') {
          credentialCleanupError = metadataError;
        }
      }
    }
    try {
      const keytar = await this.requireKeytar();
      const accounts = new Set([LEGACY_KEYTAR_ACCOUNT]);
      if (metadata) accounts.add(credentialAccount(metadata));
      try {
        const credentials = await keytar.findCredentials(this.service);
        credentials.forEach(({ account }) => {
          if (account.startsWith('agents-session-v2:')) accounts.add(account);
        });
      } catch (error) {
        credentialCleanupError ??= error;
      }
      const deletionResults = await Promise.allSettled(
        [...accounts].map((account) => keytar.deletePassword(this.service, account))
      );
      const failedDeletion = deletionResults.find((result) => result.status === 'rejected');
      if (failedDeletion?.status === 'rejected') {
        credentialCleanupError ??= failedDeletion.reason;
      }
    } catch (error) {
      console.warn('[Ki-Buddy Auth] Failed to clear the Agents token from keytar', error);
      credentialCleanupError ??= error;
    }
    if (credentialCleanupError) throw credentialCleanupError;

    const fileCleanupResults = await Promise.allSettled([unlink(this.metadataPath), unlink(this.cleanupTombstonePath)]);
    const failedFileCleanup = fileCleanupResults.find(
      (result) => result.status === 'rejected' && (result.reason as NodeJS.ErrnoException).code !== 'ENOENT'
    );
    const fileCleanupError = failedFileCleanup?.status === 'rejected' ? failedFileCleanup.reason : null;
    if (fileCleanupError) throw fileCleanupError;
  }

  private async readMetadata(): Promise<CredentialMetadata | null> {
    let contents: string;
    try {
      contents = await readFile(this.metadataPath, 'utf8');
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
      throw error;
    }
    try {
      return parseMetadata(JSON.parse(contents) as unknown);
    } catch {
      return null;
    }
  }

  private async hasCleanupTombstone(): Promise<boolean> {
    try {
      await readFile(this.cleanupTombstonePath, 'utf8');
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async writeCleanupTombstone(): Promise<void> {
    const directory = path.dirname(this.cleanupTombstonePath);
    const temporaryPath = `${this.cleanupTombstonePath}.${process.pid}.tmp`;
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, JSON.stringify({ schemaVersion: 1 }), { mode: 0o600 });
      await rename(temporaryPath, this.cleanupTombstonePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }

  private async requireKeytar(): Promise<KeytarApi> {
    try {
      const keytar = await this.loadKeytar();
      if (!isKeytarApi(keytar)) throw new Error('invalid keytar module');
      return keytar;
    } catch (error) {
      throw new Error(STORAGE_UNAVAILABLE_MESSAGE, { cause: error });
    }
  }
}
