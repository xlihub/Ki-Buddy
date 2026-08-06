const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const KI_CORE_REPOSITORY = 'xlihub/Ki-Core';
const KI_CORE_WORKFLOW = {
  candidate: 'build-manual.yml',
};
const KI_CORE_SOURCE_POLICIES = new Set(['candidate', 'development', 'release-pinned']);
const SHA40_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ARCHIVE_HELPER_TIMEOUT_MS = 120000;

const CANONICAL_PLATFORMS = {
  'macos-x64': {
    runtimeKey: 'darwin-x64',
    target: 'x86_64-apple-darwin',
    executable: 'aioncore',
    extension: '.tar.gz',
  },
  'macos-arm64': {
    runtimeKey: 'darwin-arm64',
    target: 'aarch64-apple-darwin',
    executable: 'aioncore',
    extension: '.tar.gz',
  },
  'linux-x64': {
    runtimeKey: 'linux-x64',
    target: 'x86_64-unknown-linux-gnu',
    executable: 'aioncore',
    extension: '.tar.gz',
  },
  'linux-arm64': {
    runtimeKey: 'linux-arm64',
    target: 'aarch64-unknown-linux-gnu',
    executable: 'aioncore',
    extension: '.tar.gz',
  },
  'windows-x64': {
    runtimeKey: 'win32-x64',
    target: 'x86_64-pc-windows-msvc',
    executable: 'aioncore.exe',
    extension: '.zip',
  },
  'windows-arm64': {
    runtimeKey: 'win32-arm64',
    target: 'aarch64-pc-windows-msvc',
    executable: 'aioncore.exe',
    extension: '.zip',
  },
};

const PLATFORM_BY_RUNTIME = Object.fromEntries(
  Object.entries(CANONICAL_PLATFORMS).map(([platformKey, value]) => [value.runtimeKey, { platformKey, ...value }])
);

function requireExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).toSorted();
  const expected = keys.toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function getCanonicalTarget(platform, arch) {
  const target = PLATFORM_BY_RUNTIME[`${platform}-${arch}`];
  if (!target) throw new Error(`Unsupported Ki-Core target: ${platform}-${arch}`);
  return target;
}

function getArchiveName(tag, target) {
  if (!/^ki-core-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
    throw new Error('Ki-Core tag must use the full ki-core-vX.Y.Z form');
  }
  return `${tag}-${target.target}${target.extension}`;
}

function getReleaseUrl(tag, assetName) {
  return `https://github.com/${KI_CORE_REPOSITORY}/releases/download/${tag}/${assetName}`;
}

function getSourcePolicy(explicitPolicy) {
  const policy = String(explicitPolicy || process.env.AIONUI_BACKEND_SOURCE_POLICY || 'development').trim();
  if (!KI_CORE_SOURCE_POLICIES.has(policy)) {
    throw new Error(`Unsupported Ki-Core source policy: ${policy}`);
  }
  return policy;
}

function readKiCorePin(projectRoot) {
  let productConfig;
  try {
    productConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'ki-buddy-product.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read Ki-Core product pin: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }

  const pin = productConfig.kiCore;
  if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
    throw new Error('ki-buddy-product.json must define a kiCore product pin');
  }
  if (pin.repository !== KI_CORE_REPOSITORY) {
    throw new Error(`Ki-Core product pin repository must be ${KI_CORE_REPOSITORY}`);
  }
  requireExactKeys(pin, ['repository', 'tag', 'commit', 'aionCore', 'checksums'], 'Ki-Core product pin');
  if (typeof pin.tag !== 'string' || !/^ki-core-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pin.tag)) {
    throw new Error('Ki-Core product pin must contain a full ki-core-vX.Y.Z tag');
  }
  if (typeof pin.commit !== 'string' || !SHA40_PATTERN.test(pin.commit)) {
    throw new Error('Ki-Core product pin commit must be a full lowercase commit SHA');
  }
  validateUpstream(pin.aionCore);
  requireExactKeys(pin.checksums, Object.keys(CANONICAL_PLATFORMS), 'Ki-Core product pin checksums');
  for (const [platformKey, checksum] of Object.entries(pin.checksums)) {
    if (typeof checksum !== 'string' || !SHA256_PATTERN.test(checksum)) {
      throw new Error(`Ki-Core product pin checksum is malformed: ${platformKey}`);
    }
  }
  return {
    repository: pin.repository,
    tag: pin.tag,
    commit: pin.commit,
    aionCore: { ...pin.aionCore },
    checksums: { ...pin.checksums },
  };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseChecksums(checksumText) {
  const lines = checksumText.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0 || lines.some((line) => line === '')) {
    throw new Error('Ki-Core checksum file is empty or contains blank entries');
  }

  const checksums = new Map();
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);
    if (!match) throw new Error(`Malformed Ki-Core checksum entry: ${line}`);
    const [, digest, name] = match;
    if (checksums.has(name)) throw new Error(`Duplicate Ki-Core checksum entry: ${name}`);
    checksums.set(name, digest);
  }
  return checksums;
}

function validateUpstream(upstream) {
  requireExactKeys(upstream, ['repository', 'tag', 'peeledCommit'], 'AionCore provenance');
  if (upstream.repository !== 'iOfficeAI/AionCore') throw new Error('AionCore provenance repository is invalid');
  if (!/^v\d+\.\d+\.\d+$/.test(upstream.tag)) throw new Error('AionCore provenance tag is invalid');
  if (!SHA40_PATTERN.test(upstream.peeledCommit)) throw new Error('AionCore provenance commit is invalid');
}

function validateDownloadedAssets(options) {
  const { platformKey, tag, checksumPath, archivePath, pinnedChecksums } = options;
  const version = tag.replace(/^ki-core-v/, '');
  const checksums = parseChecksums(fs.readFileSync(checksumPath, 'utf8'));
  const expectedChecksumNames = Object.values(CANONICAL_PLATFORMS).map(
    (contract) => `ki-core-v${version}-${contract.target}${contract.extension}`
  );
  if (checksums.size !== expectedChecksumNames.length || expectedChecksumNames.some((name) => !checksums.has(name))) {
    throw new Error('Ki-Core stable checksum file does not cover the exact six-platform asset set');
  }

  for (const [key, contract] of Object.entries(CANONICAL_PLATFORMS)) {
    const archiveName = `ki-core-v${version}-${contract.target}${contract.extension}`;
    if (pinnedChecksums?.[key] !== checksums.get(archiveName)) {
      throw new Error(`Ki-Core checked-in checksum does not match the release checksum file for ${key}`);
    }
  }

  const selectedContract = CANONICAL_PLATFORMS[platformKey];
  const selectedArchive = `ki-core-v${version}-${selectedContract.target}${selectedContract.extension}`;
  if (path.basename(archivePath) !== selectedArchive || sha256File(archivePath) !== checksums.get(selectedArchive)) {
    throw new Error(`Ki-Core archive checksum does not match for ${platformKey}`);
  }
  return { version, tag };
}

function validateCandidateRun(run, expectations) {
  if (!run || typeof run !== 'object') throw new Error('Ki-Core candidate workflow run was not found');
  const repository = run.repository?.full_name || run.repository?.fullName;
  if (repository !== KI_CORE_REPOSITORY) throw new Error('Ki-Core candidate run repository does not match');
  if (run.path !== `.github/workflows/${KI_CORE_WORKFLOW.candidate}`) {
    throw new Error('Ki-Core candidate run workflow does not match');
  }
  if (run.event !== 'workflow_dispatch' || run.conclusion !== 'success' || run.status !== 'completed') {
    throw new Error('Ki-Core candidate run is not a successful completed workflow dispatch');
  }
  if (run.head_branch !== 'product/main' || run.head_sha !== expectations.headSha) {
    throw new Error('Ki-Core candidate run source commit does not match');
  }
}

function selectCandidateArtifact(artifacts, expectedName) {
  const matches = artifacts.filter((artifact) => artifact?.name === expectedName && !artifact.expired);
  if (matches.length !== 1) {
    throw new Error(`Ki-Core candidate run must contain exactly one non-expired artifact named ${expectedName}`);
  }
  return matches[0];
}

function extractArchiveSafely(archivePath, outputDir, expectedEntries) {
  const helperPath = path.join(__dirname, 'safeExtractArchive.js');
  try {
    execFileSync(process.execPath, [helperPath, archivePath, outputDir, JSON.stringify(expectedEntries)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: ARCHIVE_HELPER_TIMEOUT_MS,
    });
  } catch (error) {
    const detail = error?.stderr?.trim();
    throw new Error(detail || `Failed to validate and extract ${path.basename(archivePath)}`, { cause: error });
  }
}

function inspectArchiveSafely(archivePath) {
  const helperPath = path.join(__dirname, 'safeExtractArchive.js');
  try {
    return JSON.parse(
      execFileSync(process.execPath, [helperPath, '--inspect', archivePath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: ARCHIVE_HELPER_TIMEOUT_MS,
      })
    );
  } catch (error) {
    const detail = error?.stderr?.trim();
    throw new Error(detail || `Failed to inspect ${path.basename(archivePath)}`, { cause: error });
  }
}

function createBundleProvenance(manifest, source, productIdentity) {
  const candidateVersion = source?.policy === 'candidate' ? source.version : null;
  const kiCore = manifest
    ? {
        version: manifest.product.version,
        tag: manifest.product.tag,
        releaseCommit: manifest.product.releaseCommit,
      }
    : { version: candidateVersion, tag: null, releaseCommit: null };
  const aionCore = manifest
    ? {
        repository: manifest.upstream.repository,
        tag: manifest.upstream.tag,
        peeledCommit: manifest.upstream.peeledCommit,
      }
    : { repository: null, tag: null, peeledCommit: null };
  if (productIdentity) {
    return {
      schemaVersion: 3,
      version: productIdentity.kiBuddy.version,
      kiBuddy: productIdentity.kiBuddy,
      aionUi: productIdentity.aionUi,
      kiCore,
      aionCore,
      source,
    };
  }
  return {
    schemaVersion: 2,
    version: manifest?.product?.version || candidateVersion || 'local',
    kiCore,
    aionCore,
    source,
  };
}

module.exports = {
  CANONICAL_PLATFORMS,
  KI_CORE_REPOSITORY,
  createBundleProvenance,
  extractArchiveSafely,
  getArchiveName,
  getCanonicalTarget,
  getReleaseUrl,
  getSourcePolicy,
  inspectArchiveSafely,
  parseChecksums,
  readKiCorePin,
  selectCandidateArtifact,
  sha256File,
  validateCandidateRun,
  validateDownloadedAssets,
};
