import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import * as tar from 'tar';

const {
  CANONICAL_PLATFORMS,
  createBundleProvenance,
  extractArchiveSafely,
  getArchiveName,
  getCanonicalTarget,
  getReleaseUrl,
  readKiCorePin,
  validateDownloadedAssets,
} = require('../../../packages/shared-scripts/src/kiCoreRelease');
const { validateEntries } = require('../../../packages/shared-scripts/src/safeExtractArchive');
const { prepareAioncore } = require('../../../packages/shared-scripts/src/prepare-aioncore');
const { resolveAioncoreVersion } = require('../../../scripts/resolveAioncoreVersion');

const VERSION = '0.1.0';
const TAG = `ki-core-v${VERSION}`;
const RELEASE_SHA = 'a'.repeat(40);
const UPSTREAM_SHA = 'b'.repeat(40);

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function writeStoredZip(
  filePath: string,
  entries: Array<{ name: string; content: string | Buffer; encrypted?: boolean; mode?: number }>
) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
    const payload = entry.encrypted ? Buffer.concat([Buffer.alloc(12), content]) : content;
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.encrypted ? 0x801 : 0x800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.encrypted ? 0x801 : 0x800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + payload.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(filePath, Buffer.concat([...localParts, ...centralParts, end]));
}

async function createStableFixture() {
  const root = mkdtempSync(join(tmpdir(), 'ki-core-stable-fixture-'));
  const binaryDir = join(root, 'binary-source');
  mkdirSync(binaryDir);
  writeFileSync(join(binaryDir, 'aioncore'), 'verified-binary');

  const selected = getCanonicalTarget('linux', 'x64');
  const archiveName = getArchiveName(TAG, selected);
  const archivePath = join(root, archiveName);
  await tar.c({ cwd: binaryDir, file: archivePath, gzip: true }, ['aioncore']);
  const selectedHash = sha256(readFileSync(archivePath));

  const platforms = Object.fromEntries(
    Object.entries(CANONICAL_PLATFORMS).map(([platformKey, contract], index) => {
      const name = `${TAG}-${contract.target}${contract.extension}`;
      return [
        platformKey,
        {
          target: contract.target,
          archive: name,
          executable: contract.executable,
          sha256: platformKey === selected.platformKey ? selectedHash : String(index + 1).repeat(64),
        },
      ];
    })
  );
  const manifest = {
    schemaVersion: 1,
    release: {
      type: 'stable',
      repository: 'xlihub/Ki-Core',
      workflow: 'release.yml',
      runId: '12345',
      headSha: RELEASE_SHA,
    },
    product: { name: 'Ki-Core', version: VERSION, tag: TAG, releaseCommit: RELEASE_SHA },
    upstream: { repository: 'iOfficeAI/AionCore', tag: 'v0.1.58', peeledCommit: UPSTREAM_SHA },
    platforms,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = join(root, 'ki-core-release.json');
  const checksumPath = join(root, 'ki-core-checksums.txt');
  writeFileSync(manifestPath, manifestText);
  writeFileSync(
    checksumPath,
    `${Object.values(platforms)
      .map((entry) => `${entry.sha256}  ${entry.archive}`)
      .join('\n')}\n${sha256(manifestText)}  ki-core-release.json\n`
  );

  return {
    archivePath,
    checksumPath,
    manifest,
    manifestPath,
    pin: {
      repository: 'xlihub/Ki-Core',
      tag: TAG,
      checksums: Object.fromEntries(
        Object.entries(platforms).map(([platformKey, entry]) => [platformKey, entry.sha256])
      ),
    },
    root,
    selected,
  };
}

async function createCandidateFixture() {
  const fixture = await createStableFixture();
  const selectedEntry = fixture.manifest.platforms[fixture.selected.platformKey];
  const manifest = {
    ...fixture.manifest,
    release: {
      type: 'candidate',
      repository: 'xlihub/Ki-Core',
      workflow: 'build-manual.yml',
      runId: '54321',
      headSha: RELEASE_SHA,
    },
    product: { name: 'Ki-Core', version: VERSION, tag: null, releaseCommit: null },
    platforms: { [fixture.selected.platformKey]: selectedEntry },
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = join(fixture.root, 'ki-core-candidate.json');
  writeFileSync(manifestPath, manifestText);
  writeFileSync(
    fixture.checksumPath,
    `${selectedEntry.sha256}  ${selectedEntry.archive}\n${sha256(manifestText)}  ki-core-candidate.json\n`
  );
  return { ...fixture, manifest, manifestPath };
}

afterEach(() => {
  delete process.env.AIONUI_BACKEND_LOCAL_BINARY;
  delete process.env.AIONUI_BACKEND_SOURCE_POLICY;
  delete process.env.AIONUI_BACKEND_VERSION;
});

describe('Ki-Core stable release naming', () => {
  it.each([
    ['darwin', 'x64', 'ki-core-v0.1.0-x86_64-apple-darwin.tar.gz'],
    ['darwin', 'arm64', 'ki-core-v0.1.0-aarch64-apple-darwin.tar.gz'],
    ['linux', 'x64', 'ki-core-v0.1.0-x86_64-unknown-linux-gnu.tar.gz'],
    ['linux', 'arm64', 'ki-core-v0.1.0-aarch64-unknown-linux-gnu.tar.gz'],
    ['win32', 'x64', 'ki-core-v0.1.0-x86_64-pc-windows-msvc.zip'],
    ['win32', 'arm64', 'ki-core-v0.1.0-aarch64-pc-windows-msvc.zip'],
  ])('maps %s-%s to the xlihub/Ki-Core asset %s', (platform, arch, expectedAsset) => {
    const asset = getArchiveName(TAG, getCanonicalTarget(platform, arch));
    expect(asset).toBe(expectedAsset);
    expect(getReleaseUrl(TAG, asset)).toBe(
      `https://github.com/xlihub/Ki-Core/releases/download/${TAG}/${expectedAsset}`
    );
  });

  it('fails when the checked-in stable pin is incomplete', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'ki-core-missing-pin-'));
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ kiCore: { repository: 'xlihub/Ki-Core', tag: null, checksums: {} } })
    );
    try {
      expect(() => readKiCorePin(projectRoot)).toThrow(/full ki-core-vX\.Y\.Z tag/);
      expect(() => resolveAioncoreVersion(projectRoot, 'release-pinned')).toThrow(/product pin/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('forbids local sources under release-pinned policy', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'ki-core-release-policy-'));
    process.env.AIONUI_BACKEND_SOURCE_POLICY = 'release-pinned';
    process.env.AIONUI_BACKEND_LOCAL_BINARY = join(projectRoot, 'aioncore');
    try {
      expect(() => prepareAioncore({ projectRoot, platform: 'linux', arch: 'x64', version: TAG })).toThrow(
        /Local Ki-Core inputs are forbidden/
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('Ki-Core stable asset verification', () => {
  it('accepts matching manifest, checksum file, archive, and checked-in platform pins', async () => {
    const fixture = await createStableFixture();
    try {
      const manifest = validateDownloadedAssets({
        sourceType: 'stable',
        platformKey: fixture.selected.platformKey,
        tag: TAG,
        manifestPath: fixture.manifestPath,
        checksumPath: fixture.checksumPath,
        archivePath: fixture.archivePath,
        pinnedChecksums: fixture.pin.checksums,
      });
      expect(manifest.product.releaseCommit).toBe(RELEASE_SHA);
      expect(manifest.upstream.peeledCommit).toBe(UPSTREAM_SHA);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('accepts a stable manifest whose platform object uses a different key order', async () => {
    const fixture = await createStableFixture();
    try {
      fixture.manifest.platforms = Object.fromEntries(Object.entries(fixture.manifest.platforms).toReversed());
      const manifestText = `${JSON.stringify(fixture.manifest, null, 2)}\n`;
      writeFileSync(fixture.manifestPath, manifestText);
      writeFileSync(
        fixture.checksumPath,
        `${Object.values(fixture.manifest.platforms)
          .map((entry) => `${entry.sha256}  ${entry.archive}`)
          .join('\n')}\n${sha256(manifestText)}  ki-core-release.json\n`
      );

      expect(() =>
        validateDownloadedAssets({
          sourceType: 'stable',
          platformKey: fixture.selected.platformKey,
          tag: TAG,
          manifestPath: fixture.manifestPath,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
          pinnedChecksums: fixture.pin.checksums,
        })
      ).not.toThrow();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a duplicate checksum before extraction', async () => {
    const fixture = await createStableFixture();
    try {
      const firstLine = readFileSync(fixture.checksumPath, 'utf8').split('\n')[0];
      writeFileSync(fixture.checksumPath, `${readFileSync(fixture.checksumPath, 'utf8')}${firstLine}\n`);
      expect(() =>
        validateDownloadedAssets({
          sourceType: 'stable',
          platformKey: fixture.selected.platformKey,
          tag: TAG,
          manifestPath: fixture.manifestPath,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
          pinnedChecksums: fixture.pin.checksums,
        })
      ).toThrow(/Duplicate Ki-Core checksum/);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a tampered archive before extraction', async () => {
    const fixture = await createStableFixture();
    try {
      writeFileSync(fixture.archivePath, 'tampered');
      expect(() =>
        validateDownloadedAssets({
          sourceType: 'stable',
          platformKey: fixture.selected.platformKey,
          tag: TAG,
          manifestPath: fixture.manifestPath,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
          pinnedChecksums: fixture.pin.checksums,
        })
      ).toThrow(/archive checksum/);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a manifest that disagrees with the checked-in platform checksum', async () => {
    const fixture = await createStableFixture();
    try {
      fixture.pin.checksums['macos-x64'] = 'f'.repeat(64);
      expect(() =>
        validateDownloadedAssets({
          sourceType: 'stable',
          platformKey: fixture.selected.platformKey,
          tag: TAG,
          manifestPath: fixture.manifestPath,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
          pinnedChecksums: fixture.pin.checksums,
        })
      ).toThrow(/checked-in checksum/);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe('Ki-Core candidate asset verification', () => {
  it('accepts artifact provenance only for the requested run and head SHA', async () => {
    const fixture = await createCandidateFixture();
    try {
      const manifest = validateDownloadedAssets({
        sourceType: 'candidate',
        platformKey: fixture.selected.platformKey,
        runId: '54321',
        headSha: RELEASE_SHA,
        manifestPath: fixture.manifestPath,
        checksumPath: fixture.checksumPath,
        archivePath: fixture.archivePath,
      });
      expect(manifest.product.tag).toBeNull();
      expect(manifest.release.workflow).toBe('build-manual.yml');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    ['run ID', '99999', RELEASE_SHA],
    ['head SHA', '54321', 'c'.repeat(40)],
  ])('rejects candidate manifest %s substitution', async (expectedError, runId, headSha) => {
    const fixture = await createCandidateFixture();
    try {
      expect(() =>
        validateDownloadedAssets({
          sourceType: 'candidate',
          platformKey: fixture.selected.platformKey,
          runId,
          headSha,
          manifestPath: fixture.manifestPath,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
        })
      ).toThrow(expectedError);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe('Ki-Core bundle provenance', () => {
  it('carries stable Ki-Core and AionCore identity from the verified release manifest', async () => {
    const fixture = await createStableFixture();
    try {
      const provenance = createBundleProvenance(fixture.manifest, {
        policy: 'release-pinned',
        repository: 'xlihub/Ki-Core',
      });
      expect(provenance.kiCore).toEqual({ version: VERSION, tag: TAG, releaseCommit: RELEASE_SHA });
      expect(provenance.aionCore).toEqual({
        repository: 'iOfficeAI/AionCore',
        tag: 'v0.1.58',
        peeledCommit: UPSTREAM_SHA,
      });
      expect(provenance.version).toBe(VERSION);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('does not let local sources claim stable product or upstream identity', () => {
    const provenance = createBundleProvenance(null, { policy: 'development', type: 'local-binary' });
    expect(provenance.kiCore).toEqual({ version: null, tag: null, releaseCommit: null });
    expect(provenance.aionCore).toEqual({ repository: null, tag: null, peeledCommit: null });
    expect(provenance.version).toBe('local');
  });
});

describe('Ki-Core archive extraction safety', () => {
  it.each([
    ['absolute path', '/aioncore'],
    ['parent traversal', '../aioncore'],
    ['Windows drive path', 'C:/aioncore.exe'],
    ['backslash traversal', '..\\aioncore.exe'],
  ])('rejects %s entries', (_label, entryName) => {
    expect(() =>
      validateEntries([{ name: entryName, isFile: true, isSymbolicLink: false, isHardLink: false }], ['aioncore'])
    ).toThrow(/Archive entry/);
  });

  it('rejects symbolic links, hard links, normalized duplicates, and unexpected content', () => {
    expect(() =>
      validateEntries([{ name: 'aioncore', isFile: false, isSymbolicLink: true, isHardLink: false }], ['aioncore'])
    ).toThrow(/regular file/);
    expect(() =>
      validateEntries([{ name: 'aioncore', isFile: false, isSymbolicLink: false, isHardLink: true }], ['aioncore'])
    ).toThrow(/regular file/);
    expect(() =>
      validateEntries(
        [
          { name: 'aioncore', isFile: true, isSymbolicLink: false, isHardLink: false },
          { name: 'aioncore', isFile: true, isSymbolicLink: false, isHardLink: false },
        ],
        ['aioncore']
      )
    ).toThrow(/duplicate normalized entry/);
    expect(() =>
      validateEntries([{ name: 'extra', isFile: true, isSymbolicLink: false, isHardLink: false }], ['aioncore'])
    ).toThrow(/unexpected entry/);
  });

  it('extracts one verified executable into a newly created temporary directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ki-core-safe-extract-'));
    const sourceDir = join(root, 'source');
    const archivePath = join(root, 'valid.tar.gz');
    const outputDir = join(root, 'output');
    mkdirSync(sourceDir);
    writeFileSync(join(sourceDir, 'aioncore'), 'verified-binary');
    await tar.c({ cwd: sourceDir, file: archivePath, gzip: true }, ['aioncore']);
    try {
      extractArchiveSafely(archivePath, outputDir, ['aioncore']);
      expect(readFileSync(join(outputDir, 'aioncore'), 'utf8')).toBe('verified-binary');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('extracts a verified Windows executable from ZIP without invoking a system unzip command', () => {
    const root = mkdtempSync(join(tmpdir(), 'ki-core-safe-zip-'));
    const archivePath = join(root, 'valid.zip');
    const outputDir = join(root, 'output');
    writeStoredZip(archivePath, [{ name: 'aioncore.exe', content: 'verified-windows-binary' }]);
    try {
      extractArchiveSafely(archivePath, outputDir, ['aioncore.exe']);
      expect(readFileSync(join(outputDir, 'aioncore.exe'), 'utf8')).toBe('verified-windows-binary');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a ZIP symbolic link before creating the output directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ki-core-unsafe-zip-'));
    const archivePath = join(root, 'link.zip');
    const outputDir = join(root, 'output');
    writeStoredZip(archivePath, [{ name: 'aioncore.exe', content: 'outside.exe', mode: 0o120777 }]);
    try {
      expect(() => extractArchiveSafely(archivePath, outputDir, ['aioncore.exe'])).toThrow(/regular file/);
      expect(() => readFileSync(join(outputDir, 'aioncore.exe'))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an encrypted ZIP entry before creating the output directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'ki-core-encrypted-zip-'));
    const archivePath = join(root, 'encrypted.zip');
    const outputDir = join(root, 'output');
    writeStoredZip(archivePath, [{ name: 'aioncore.exe', content: 'encrypted', encrypted: true }]);
    try {
      expect(() => extractArchiveSafely(archivePath, outputDir, ['aioncore.exe'])).toThrow(/Encrypted/);
      expect(() => readFileSync(join(outputDir, 'aioncore.exe'))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
