import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AgentsCredentialStore, StoredAgentsSession } from './AgentsAuthService';

const CREDENTIAL_METADATA_SCHEMA_VERSION = 1;
const DEFAULT_KEYTAR_SERVICE = 'Ki-Buddy Agents';
const KEYTAR_ACCOUNT = 'agents-session';
const STORAGE_UNAVAILABLE_MESSAGE = 'secure operating-system credential storage is unavailable';

type CredentialMetadata = {
  schemaVersion: typeof CREDENTIAL_METADATA_SCHEMA_VERSION;
  baseUrl: string;
  userId: string;
};

type KeytarApi = {
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

function parseMetadata(value: unknown): CredentialMetadata | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== CREDENTIAL_METADATA_SCHEMA_VERSION ||
    typeof value.baseUrl !== 'string' ||
    value.baseUrl.trim() === '' ||
    typeof value.userId !== 'string' ||
    value.userId.trim() === ''
  ) {
    return null;
  }
  return {
    schemaVersion: CREDENTIAL_METADATA_SCHEMA_VERSION,
    baseUrl: value.baseUrl,
    userId: value.userId,
  };
}

/** Persists Agents tokens in the operating-system credential manager and non-sensitive identity metadata on disk. */
export class KeytarCredentialStore implements AgentsCredentialStore {
  private readonly metadataPath: string;
  private readonly loadKeytar: () => Promise<KeytarApi>;
  private readonly service: string;

  /** Creates a credential store scoped to the current app profile and optional test namespace. */
  constructor(userDataPath: string, options: KeytarCredentialStoreOptions = {}) {
    this.metadataPath = path.join(userDataPath, 'ki-buddy', 'agents-session.json');
    this.loadKeytar = options.loadKeytar ?? loadSystemKeytar;
    this.service = keytarService(options.storageNamespace ?? process.env.AIONUI_AUTH_STORAGE_NAMESPACE);
  }

  /** Loads identity metadata first and resolves its token from the operating-system credential manager. */
  async load(): Promise<StoredAgentsSession | null> {
    const metadata = await this.readMetadata();
    if (!metadata) return null;

    const keytar = await this.requireKeytar();
    let token: string | null;
    try {
      token = await keytar.getPassword(this.service, KEYTAR_ACCOUNT);
    } catch (error) {
      console.warn('[Ki-Buddy Auth] Failed to load the Agents token from keytar', error);
      throw error;
    }
    if (typeof token !== 'string' || token.trim() === '') {
      return null;
    }
    return { baseUrl: metadata.baseUrl, token, userId: metadata.userId };
  }

  /** Saves the token before atomically writing metadata, rolling the credential back if the file write fails. */
  async save(session: StoredAgentsSession): Promise<void> {
    const keytar = await this.requireKeytar();
    const metadata: CredentialMetadata = {
      schemaVersion: CREDENTIAL_METADATA_SCHEMA_VERSION,
      baseUrl: session.baseUrl,
      userId: session.userId,
    };
    try {
      await keytar.setPassword(this.service, KEYTAR_ACCOUNT, session.token);
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
      await keytar.deletePassword(this.service, KEYTAR_ACCOUNT).catch((cleanupError: unknown) => {
        console.warn('[Ki-Buddy Auth] Failed to roll back the Agents token from keytar', cleanupError);
        return false;
      });
      throw error;
    }
  }

  /** Removes both local identity metadata and the corresponding operating-system credential. */
  async clear(): Promise<void> {
    let cleanupError: unknown;
    await unlink(this.metadataPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        console.warn('[Ki-Buddy Auth] Failed to clear Agents session metadata', error);
        cleanupError = error;
      }
    });
    try {
      const keytar = await this.requireKeytar();
      await keytar.deletePassword(this.service, KEYTAR_ACCOUNT);
    } catch (error) {
      console.warn('[Ki-Buddy Auth] Failed to clear the Agents token from keytar', error);
      cleanupError ??= error;
    }
    if (cleanupError) throw cleanupError;
  }

  private async readMetadata(): Promise<CredentialMetadata | null> {
    let contents: string;
    try {
      contents = await readFile(this.metadataPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    try {
      return parseMetadata(JSON.parse(contents) as unknown);
    } catch {
      return null;
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
