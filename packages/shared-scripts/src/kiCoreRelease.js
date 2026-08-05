const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const KI_CORE_REPOSITORY = 'xlihub/Ki-Core';
const KI_CORE_WORKFLOW = {
  candidate: 'build-manual.yml',
  stable: 'release.yml',
};
const KI_CORE_SOURCE_POLICIES = new Set(['candidate', 'development', 'release-pinned']);
const SHA40_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

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
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read Ki-Core product pin: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }

  const pin = packageJson.kiCore;
  if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
    throw new Error('package.json must define a kiCore product pin');
  }
  if (pin.repository !== KI_CORE_REPOSITORY) {
    throw new Error(`Ki-Core product pin repository must be ${KI_CORE_REPOSITORY}`);
  }
  if (typeof pin.tag !== 'string' || !/^ki-core-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pin.tag)) {
    throw new Error('Ki-Core product pin must contain a full ki-core-vX.Y.Z tag');
  }
  requireExactKeys(pin.checksums, Object.keys(CANONICAL_PLATFORMS), 'Ki-Core product pin checksums');
  for (const [platformKey, checksum] of Object.entries(pin.checksums)) {
    if (typeof checksum !== 'string' || !SHA256_PATTERN.test(checksum)) {
      throw new Error(`Ki-Core product pin checksum is malformed: ${platformKey}`);
    }
  }
  return {
    repository: pin.repository,
    tag: pin.tag,
    checksums: { ...pin.checksums },
  };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function validatePlatformManifest(platforms, version, sourceType, selectedPlatform) {
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) {
    throw new Error('Ki-Core platforms must be an object');
  }
  const expectedKeys = sourceType === 'stable' ? Object.keys(CANONICAL_PLATFORMS) : [selectedPlatform];
  if (JSON.stringify(Object.keys(platforms)) !== JSON.stringify(expectedKeys)) {
    throw new Error(`Ki-Core ${sourceType} manifest has an unexpected platform set`);
  }

  for (const platformKey of expectedKeys) {
    const contract = CANONICAL_PLATFORMS[platformKey];
    const entry = platforms[platformKey];
    requireExactKeys(entry, ['target', 'archive', 'executable', 'sha256'], `Ki-Core platform ${platformKey}`);
    const archive = `ki-core-v${version}-${contract.target}${contract.extension}`;
    if (entry.target !== contract.target || entry.archive !== archive || entry.executable !== contract.executable) {
      throw new Error(`Ki-Core platform contract does not match: ${platformKey}`);
    }
    if (!SHA256_PATTERN.test(entry.sha256)) throw new Error(`Ki-Core platform checksum is malformed: ${platformKey}`);
  }
}

function validateReleaseManifest(manifest, expectations) {
  const { sourceType, platformKey, tag, runId, headSha } = expectations;
  requireExactKeys(manifest, ['schemaVersion', 'release', 'product', 'upstream', 'platforms'], 'Ki-Core manifest');
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported Ki-Core release manifest schema');

  requireExactKeys(
    manifest.release,
    ['type', 'repository', 'workflow', 'runId', 'headSha'],
    'Ki-Core release identity'
  );
  if (manifest.release.type !== sourceType || manifest.release.repository !== KI_CORE_REPOSITORY) {
    throw new Error('Ki-Core release source identity does not match the requested policy');
  }
  if (manifest.release.workflow !== KI_CORE_WORKFLOW[sourceType]) {
    throw new Error('Ki-Core release workflow identity is invalid');
  }
  if (!/^[1-9]\d*$/.test(manifest.release.runId) || !SHA40_PATTERN.test(manifest.release.headSha)) {
    throw new Error('Ki-Core release run identity is malformed');
  }
  if (runId && manifest.release.runId !== runId) throw new Error('Ki-Core candidate manifest run ID does not match');
  if (headSha && manifest.release.headSha !== headSha)
    throw new Error('Ki-Core candidate manifest head SHA does not match');

  requireExactKeys(manifest.product, ['name', 'version', 'tag', 'releaseCommit'], 'Ki-Core product identity');
  if (manifest.product.name !== 'Ki-Core' || !SEMVER_PATTERN.test(manifest.product.version)) {
    throw new Error('Ki-Core product identity is malformed');
  }
  if (sourceType === 'stable') {
    if (manifest.product.tag !== tag || tag !== `ki-core-v${manifest.product.version}`) {
      throw new Error('Ki-Core stable tag does not match its product version');
    }
    if (manifest.product.releaseCommit !== manifest.release.headSha) {
      throw new Error('Ki-Core stable release commit does not match its workflow head SHA');
    }
  } else if (manifest.product.tag !== null || manifest.product.releaseCommit !== null) {
    throw new Error('Ki-Core candidate manifest cannot claim stable product provenance');
  }

  validateUpstream(manifest.upstream);
  validatePlatformManifest(manifest.platforms, manifest.product.version, sourceType, platformKey);
  return manifest;
}

function validateDownloadedAssets(options) {
  const { sourceType, platformKey, tag, runId, headSha, manifestPath, checksumPath, archivePath, pinnedChecksums } =
    options;
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(`Ki-Core manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  validateReleaseManifest(manifest, { sourceType, platformKey, tag, runId, headSha });

  const checksums = parseChecksums(fs.readFileSync(checksumPath, 'utf8'));
  const manifestName = sourceType === 'stable' ? 'ki-core-release.json' : 'ki-core-candidate.json';
  const expectedChecksumNames =
    sourceType === 'stable'
      ? [
          ...Object.entries(CANONICAL_PLATFORMS).map(
            ([, contract]) => `ki-core-v${manifest.product.version}-${contract.target}${contract.extension}`
          ),
          manifestName,
        ]
      : [manifest.platforms[platformKey].archive, manifestName];
  if (checksums.size !== expectedChecksumNames.length || expectedChecksumNames.some((name) => !checksums.has(name))) {
    throw new Error(`Ki-Core ${sourceType} checksum file does not cover the exact asset set`);
  }
  if (checksums.get(manifestName) !== sha256Text(manifestText)) {
    throw new Error('Ki-Core release manifest checksum does not match');
  }

  for (const [key, entry] of Object.entries(manifest.platforms)) {
    if (checksums.get(entry.archive) !== entry.sha256) {
      throw new Error(`Ki-Core checksum and manifest disagree for ${key}`);
    }
    if (sourceType === 'stable' && pinnedChecksums?.[key] !== entry.sha256) {
      throw new Error(`Ki-Core checked-in checksum does not match the release manifest for ${key}`);
    }
  }

  const selectedEntry = manifest.platforms[platformKey];
  if (path.basename(archivePath) !== selectedEntry.archive || sha256File(archivePath) !== selectedEntry.sha256) {
    throw new Error(`Ki-Core archive checksum does not match for ${platformKey}`);
  }
  return manifest;
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
      })
    );
  } catch (error) {
    const detail = error?.stderr?.trim();
    throw new Error(detail || `Failed to inspect ${path.basename(archivePath)}`, { cause: error });
  }
}

function createBundleProvenance(manifest, source) {
  return {
    schemaVersion: 2,
    version: manifest?.product?.version || 'local',
    kiCore: manifest
      ? {
          version: manifest.product.version,
          tag: manifest.product.tag,
          releaseCommit: manifest.product.releaseCommit,
        }
      : { version: null, tag: null, releaseCommit: null },
    aionCore: manifest
      ? {
          repository: manifest.upstream.repository,
          tag: manifest.upstream.tag,
          peeledCommit: manifest.upstream.peeledCommit,
        }
      : { repository: null, tag: null, peeledCommit: null },
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
  validateReleaseManifest,
};
