/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

type FileStat = {
  mtimeMs: number;
  size: number;
};

type BackendInstallDiagnosticEnv = {
  appVersion?: string;
  arch?: string;
  execPath?: string;
  isPackaged?: boolean;
  platform?: NodeJS.Platform;
  readFile?: (filePath: string) => string | undefined;
  resourcesPath?: string;
  stat?: (filePath: string) => FileStat | undefined;
};

export type BackendInstallDiagnostics = {
  aionUiCommit?: string;
  aionUiRepository?: string;
  aionUiTag?: string;
  aionCorePeeledCommit?: string;
  aionCoreRepository?: string;
  aionCoreTag?: string;
  appVersion: string;
  arch: string;
  binaryExists?: boolean;
  binaryMtimeMs?: number;
  binaryName?: string;
  binaryPath?: string;
  binarySize?: number;
  bundledDirPath?: string;
  execPath: string;
  isPackaged: boolean;
  manifestExists?: boolean;
  manifestFiles?: string[];
  manifestGeneratedAt?: string;
  manifestMtimeMs?: number;
  manifestParseError?: string;
  manifestPath?: string;
  manifestSize?: number;
  manifestSchemaVersion?: number;
  manifestSourceArtifactName?: string;
  manifestSourceHeadSha?: string;
  manifestSourcePolicy?: string;
  manifestSourceRepository?: string;
  manifestSourceRunId?: string;
  manifestSourceType?: string;
  manifestSourceWorkflow?: string;
  manifestValidationError?: string;
  manifestVersion?: string;
  kiCoreReleaseCommit?: string;
  kiCoreTag?: string;
  kiCoreVersion?: string;
  kiBuddyReleaseCommit?: string;
  kiBuddyRepository?: string;
  kiBuddyTag?: string;
  kiBuddyVersion?: string;
  platform: NodeJS.Platform;
  resourcesDirMtimeMs?: number;
  resourcesPath?: string;
  runtimeDirMtimeMs?: number;
  runtimeDirPath?: string;
  runtimeKey?: string;
};

const MANIFEST_FILE_NAME = 'manifest.json';
const BUNDLED_AIONCORE_DIR = 'bundled-aioncore';

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isNullableString(value: unknown): boolean {
  return value === null || (typeof value === 'string' && value.length > 0);
}

function hasValidProvenanceShape(
  kiCore: Record<string, unknown> | undefined,
  aionCore: Record<string, unknown> | undefined,
  source: Record<string, unknown> | undefined
): boolean {
  return Boolean(
    kiCore &&
    aionCore &&
    source &&
    isNullableString(kiCore.version) &&
    isNullableString(kiCore.tag) &&
    isNullableString(kiCore.releaseCommit) &&
    isNullableString(aionCore.repository) &&
    isNullableString(aionCore.tag) &&
    isNullableString(aionCore.peeledCommit) &&
    getString(source.policy) &&
    getString(source.type)
  );
}

function hasValidProductProvenanceShape(
  kiBuddy: Record<string, unknown> | undefined,
  aionUi: Record<string, unknown> | undefined
): boolean {
  return Boolean(
    kiBuddy &&
    aionUi &&
    getString(kiBuddy.repository) &&
    getString(kiBuddy.version) &&
    getString(kiBuddy.tag) &&
    isNullableString(kiBuddy.releaseCommit) &&
    getString(aionUi.repository) &&
    getString(aionUi.tag) &&
    getString(aionUi.commit)
  );
}

function getPathApi(platform: NodeJS.Platform): typeof path.win32 | typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix;
}

function defaultStat(filePath: string): FileStat | undefined {
  try {
    const stat = fs.statSync(filePath);
    return {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  } catch {
    return undefined;
  }
}

function defaultReadFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function applyFileStat(
  diagnostics: BackendInstallDiagnostics,
  prefix: 'binary' | 'manifest' | 'resourcesDir' | 'runtimeDir',
  stat: FileStat | undefined
): void {
  if (prefix === 'binary') {
    diagnostics.binaryExists = Boolean(stat);
    if (!stat) return;
    diagnostics.binaryMtimeMs = stat.mtimeMs;
    diagnostics.binarySize = stat.size;
    return;
  }
  if (prefix === 'manifest') {
    diagnostics.manifestExists = Boolean(stat);
    if (!stat) return;
    diagnostics.manifestMtimeMs = stat.mtimeMs;
    diagnostics.manifestSize = stat.size;
    return;
  }
  if (!stat) return;
  if (prefix === 'resourcesDir') {
    diagnostics.resourcesDirMtimeMs = stat.mtimeMs;
    return;
  }
  diagnostics.runtimeDirMtimeMs = stat.mtimeMs;
}

function applyManifest(diagnostics: BackendInstallDiagnostics, manifestText: string | undefined): void {
  if (!manifestText) return;
  try {
    const manifest = JSON.parse(manifestText) as Record<string, unknown>;
    const version = getString(manifest.version);
    const generatedAt = getString(manifest.generatedAt);
    const sourceType = getString(manifest.sourceType);
    const files = getStringArray(manifest.files);
    const schemaVersion = typeof manifest.schemaVersion === 'number' ? manifest.schemaVersion : undefined;
    const kiBuddy = getRecord(manifest.kiBuddy);
    const aionUi = getRecord(manifest.aionUi);
    const kiCore = getRecord(manifest.kiCore);
    const aionCore = getRecord(manifest.aionCore);
    const source = getRecord(manifest.source);
    if (version) diagnostics.manifestVersion = version;
    if (generatedAt) diagnostics.manifestGeneratedAt = generatedAt;
    if (sourceType) diagnostics.manifestSourceType = sourceType;
    if (files) diagnostics.manifestFiles = files;
    if (schemaVersion !== undefined) diagnostics.manifestSchemaVersion = schemaVersion;
    if (schemaVersion !== undefined && schemaVersion !== 2 && schemaVersion !== 3) {
      diagnostics.manifestValidationError = `Unsupported bundle manifest schemaVersion: ${schemaVersion}`;
    }
    if ((schemaVersion === 2 || schemaVersion === 3) && !hasValidProvenanceShape(kiCore, aionCore, source)) {
      diagnostics.manifestValidationError = 'Bundle manifest provenance objects are malformed';
    }
    if (schemaVersion === 3 && !hasValidProductProvenanceShape(kiBuddy, aionUi)) {
      diagnostics.manifestValidationError = 'Bundle manifest product provenance objects are malformed';
    }

    const kiBuddyRepository = getString(kiBuddy?.repository);
    const kiBuddyVersion = getString(kiBuddy?.version);
    const kiBuddyTag = getString(kiBuddy?.tag);
    const kiBuddyReleaseCommit = getString(kiBuddy?.releaseCommit);
    const aionUiRepository = getString(aionUi?.repository);
    const aionUiTag = getString(aionUi?.tag);
    const aionUiCommit = getString(aionUi?.commit);
    const kiCoreVersion = getString(kiCore?.version);
    const kiCoreTag = getString(kiCore?.tag);
    const kiCoreReleaseCommit = getString(kiCore?.releaseCommit);
    const aionCoreRepository = getString(aionCore?.repository);
    const aionCoreTag = getString(aionCore?.tag);
    const aionCorePeeledCommit = getString(aionCore?.peeledCommit);
    const sourcePolicy = getString(source?.policy);
    const sourceRepository = getString(source?.repository);
    const sourceWorkflow = getString(source?.workflow);
    const sourceRunId = getString(source?.runId);
    const sourceHeadSha = getString(source?.headSha);
    const sourceArtifactName = getString(source?.artifactName);
    if (kiBuddyRepository) diagnostics.kiBuddyRepository = kiBuddyRepository;
    if (kiBuddyVersion) diagnostics.kiBuddyVersion = kiBuddyVersion;
    if (kiBuddyTag) diagnostics.kiBuddyTag = kiBuddyTag;
    if (kiBuddyReleaseCommit) diagnostics.kiBuddyReleaseCommit = kiBuddyReleaseCommit;
    if (aionUiRepository) diagnostics.aionUiRepository = aionUiRepository;
    if (aionUiTag) diagnostics.aionUiTag = aionUiTag;
    if (aionUiCommit) diagnostics.aionUiCommit = aionUiCommit;
    if (kiCoreVersion) diagnostics.kiCoreVersion = kiCoreVersion;
    if (kiCoreTag) diagnostics.kiCoreTag = kiCoreTag;
    if (kiCoreReleaseCommit) diagnostics.kiCoreReleaseCommit = kiCoreReleaseCommit;
    if (aionCoreRepository) diagnostics.aionCoreRepository = aionCoreRepository;
    if (aionCoreTag) diagnostics.aionCoreTag = aionCoreTag;
    if (aionCorePeeledCommit) diagnostics.aionCorePeeledCommit = aionCorePeeledCommit;
    if (sourcePolicy) diagnostics.manifestSourcePolicy = sourcePolicy;
    if (sourceRepository) diagnostics.manifestSourceRepository = sourceRepository;
    if (sourceWorkflow) diagnostics.manifestSourceWorkflow = sourceWorkflow;
    if (sourceRunId) diagnostics.manifestSourceRunId = sourceRunId;
    if (sourceHeadSha) diagnostics.manifestSourceHeadSha = sourceHeadSha;
    if (sourceArtifactName) diagnostics.manifestSourceArtifactName = sourceArtifactName;
  } catch (error) {
    diagnostics.manifestParseError = error instanceof Error ? error.message : String(error);
  }
}

export function collectBackendInstallDiagnostics(
  details: Record<string, unknown> | undefined,
  env: BackendInstallDiagnosticEnv = {}
): BackendInstallDiagnostics {
  const platform = env.platform ?? process.platform;
  const pathApi = getPathApi(platform);
  const stat = env.stat ?? defaultStat;
  const readFile = env.readFile ?? defaultReadFile;
  const resourcesPath = getString(details?.resourcesPath) ?? env.resourcesPath;
  const runtimeKey = getString(details?.runtimeKey);
  const binaryName = getString(details?.binaryName);
  const bundledDirPath = resourcesPath ? pathApi.join(resourcesPath, BUNDLED_AIONCORE_DIR) : undefined;
  const runtimeDirPath =
    resourcesPath && runtimeKey ? pathApi.join(resourcesPath, BUNDLED_AIONCORE_DIR, runtimeKey) : undefined;
  const binaryPath =
    getString(details?.checkedBundledPath) ??
    (runtimeDirPath && binaryName ? pathApi.join(runtimeDirPath, binaryName) : undefined);
  const manifestPath = runtimeDirPath ? pathApi.join(runtimeDirPath, MANIFEST_FILE_NAME) : undefined;

  const diagnostics: BackendInstallDiagnostics = {
    appVersion: env.appVersion ?? 'unknown',
    arch: env.arch ?? process.arch,
    execPath: env.execPath ?? process.execPath,
    isPackaged: env.isPackaged ?? false,
    platform,
  };

  if (resourcesPath) diagnostics.resourcesPath = resourcesPath;
  if (runtimeKey) diagnostics.runtimeKey = runtimeKey;
  if (binaryName) diagnostics.binaryName = binaryName;
  if (bundledDirPath) diagnostics.bundledDirPath = bundledDirPath;
  if (runtimeDirPath) diagnostics.runtimeDirPath = runtimeDirPath;
  if (binaryPath) diagnostics.binaryPath = binaryPath;
  if (manifestPath) diagnostics.manifestPath = manifestPath;

  if (resourcesPath) applyFileStat(diagnostics, 'resourcesDir', stat(resourcesPath));
  if (runtimeDirPath) applyFileStat(diagnostics, 'runtimeDir', stat(runtimeDirPath));
  if (binaryPath) applyFileStat(diagnostics, 'binary', stat(binaryPath));
  if (manifestPath) {
    applyFileStat(diagnostics, 'manifest', stat(manifestPath));
    applyManifest(diagnostics, readFile(manifestPath));
  }

  return diagnostics;
}
