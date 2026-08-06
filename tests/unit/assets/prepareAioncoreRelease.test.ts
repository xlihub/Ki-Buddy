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
const { readKiBuddyRelease } = require('../../../packages/shared-scripts/src/kiBuddyRelease');
const { resolveAioncoreVersion } = require('../../../scripts/resolveAioncoreVersion');

const VERSION = '7.8.9';
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
  const checksums = Object.fromEntries(
    Object.entries(CANONICAL_PLATFORMS).map(([platformKey, _contract], index) => [
      platformKey,
      platformKey === selected.platformKey ? selectedHash : String(index + 1).repeat(64),
    ])
  );
  const checksumPath = join(root, 'ki-core-checksums.txt');
  writeFileSync(
    checksumPath,
    `${Object.entries(CANONICAL_PLATFORMS)
      .map(([platformKey, contract]) => `${checksums[platformKey]}  ${TAG}-${contract.target}${contract.extension}`)
      .join('\n')}\n`
  );

  return {
    archivePath,
    checksumPath,
    pin: {
      repository: 'xlihub/Ki-Core',
      tag: TAG,
      commit: RELEASE_SHA,
      aionCore: { repository: 'iOfficeAI/AionCore', tag: 'v6.5.4', peeledCommit: UPSTREAM_SHA },
      checksums,
    },
    root,
    selected,
  };
}

afterEach(() => {
  delete process.env.AIONUI_BACKEND_LOCAL_BINARY;
  delete process.env.AIONUI_BACKEND_SOURCE_POLICY;
  delete process.env.AIONUI_BACKEND_VERSION;
});

describe('Ki-Core stable release naming and pin', () => {
  it('loads the current Ki-Core pin declared by the Ki-Buddy version mapping', () => {
    const pin = readKiCorePin(process.cwd());
    const identity = readKiBuddyRelease(process.cwd());
    expect(pin).toMatchObject({
      repository: identity.kiCore.repository,
      tag: identity.kiCore.tag,
      commit: identity.kiCore.releaseCommit,
      aionCore: identity.aionCore,
    });
  });

  it.each([
    ['darwin', 'x64', 'x86_64-apple-darwin.tar.gz'],
    ['darwin', 'arm64', 'aarch64-apple-darwin.tar.gz'],
    ['linux', 'x64', 'x86_64-unknown-linux-gnu.tar.gz'],
    ['linux', 'arm64', 'aarch64-unknown-linux-gnu.tar.gz'],
    ['win32', 'x64', 'x86_64-pc-windows-msvc.zip'],
    ['win32', 'arm64', 'aarch64-pc-windows-msvc.zip'],
  ])('maps %s-%s to the release asset suffix %s', (platform, arch, assetSuffix) => {
    const expectedAsset = `${TAG}-${assetSuffix}`;
    const asset = getArchiveName(TAG, getCanonicalTarget(platform, arch));
    expect(asset).toBe(expectedAsset);
    expect(getReleaseUrl(TAG, asset)).toBe(
      `https://github.com/xlihub/Ki-Core/releases/download/${TAG}/${expectedAsset}`
    );
  });

  it('accepts a complete product pin with explicit upstream mapping', async () => {
    const fixture = await createStableFixture();
    const projectRoot = mkdtempSync(join(tmpdir(), 'ki-core-complete-pin-'));
    writeFileSync(join(projectRoot, 'ki-buddy-product.json'), JSON.stringify({ kiCore: fixture.pin }));
    try {
      expect(readKiCorePin(projectRoot)).toEqual(fixture.pin);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails when the checked-in stable pin is incomplete', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'ki-core-missing-pin-'));
    writeFileSync(
      join(projectRoot, 'ki-buddy-product.json'),
      JSON.stringify({
        kiCore: { repository: 'xlihub/Ki-Core', tag: null, commit: null, aionCore: null, checksums: {} },
      })
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
  it('accepts the exact six release checksums and the selected archive', async () => {
    const fixture = await createStableFixture();
    try {
      expect(
        validateDownloadedAssets({
          platformKey: fixture.selected.platformKey,
          tag: TAG,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
          pinnedChecksums: fixture.pin.checksums,
        })
      ).toEqual({ version: VERSION, tag: TAG });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects duplicate or incomplete release checksums', async () => {
    const fixture = await createStableFixture();
    try {
      const lines = readFileSync(fixture.checksumPath, 'utf8').trimEnd().split('\n');
      writeFileSync(fixture.checksumPath, `${lines.join('\n')}\n${lines[0]}\n`);
      expect(() =>
        validateDownloadedAssets({
          platformKey: fixture.selected.platformKey,
          tag: TAG,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
          pinnedChecksums: fixture.pin.checksums,
        })
      ).toThrow(/Duplicate Ki-Core checksum/);

      writeFileSync(fixture.checksumPath, `${lines.slice(1).join('\n')}\n`);
      expect(() =>
        validateDownloadedAssets({
          platformKey: fixture.selected.platformKey,
          tag: TAG,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
          pinnedChecksums: fixture.pin.checksums,
        })
      ).toThrow(/exact six-platform asset set/);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a tampered archive and a mismatched checked-in checksum', async () => {
    const fixture = await createStableFixture();
    try {
      fixture.pin.checksums['macos-x64'] = 'f'.repeat(64);
      expect(() =>
        validateDownloadedAssets({
          platformKey: fixture.selected.platformKey,
          tag: TAG,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
          pinnedChecksums: fixture.pin.checksums,
        })
      ).toThrow(/checked-in checksum/);

      fixture.pin.checksums['macos-x64'] = readFileSync(fixture.checksumPath, 'utf8').split('  ')[0];
      writeFileSync(fixture.archivePath, 'tampered');
      expect(() =>
        validateDownloadedAssets({
          platformKey: fixture.selected.platformKey,
          tag: TAG,
          checksumPath: fixture.checksumPath,
          archivePath: fixture.archivePath,
          pinnedChecksums: fixture.pin.checksums,
        })
      ).toThrow(/archive checksum/);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

describe('Ki-Core bundle provenance', () => {
  it('records stable Ki-Core and AionCore identity from the checked-in pin', async () => {
    const fixture = await createStableFixture();
    const identity = {
      product: { version: VERSION, tag: TAG, releaseCommit: RELEASE_SHA },
      upstream: fixture.pin.aionCore,
    };
    try {
      const provenance = createBundleProvenance(identity, {
        policy: 'release-pinned',
        repository: 'xlihub/Ki-Core',
      });
      expect(provenance.kiCore).toEqual({ version: VERSION, tag: TAG, releaseCommit: RELEASE_SHA });
      expect(provenance.aionCore).toEqual(fixture.pin.aionCore);
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

  it('rejects symbolic links, normalized duplicates, and unexpected content', () => {
    expect(() =>
      validateEntries([{ name: 'aioncore', isFile: false, isSymbolicLink: true, isHardLink: false }], ['aioncore'])
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

  it('extracts one verified executable from tar.gz', async () => {
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

  it('extracts one verified Windows executable from ZIP', () => {
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

  it('rejects symbolic-link and encrypted ZIP entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'ki-core-unsafe-zip-'));
    const linkArchive = join(root, 'link.zip');
    const encryptedArchive = join(root, 'encrypted.zip');
    writeStoredZip(linkArchive, [{ name: 'aioncore.exe', content: 'outside.exe', mode: 0o120777 }]);
    writeStoredZip(encryptedArchive, [{ name: 'aioncore.exe', content: 'encrypted', encrypted: true }]);
    try {
      expect(() => extractArchiveSafely(linkArchive, join(root, 'link-output'), ['aioncore.exe'])).toThrow(
        /regular file/
      );
      expect(() => extractArchiveSafely(encryptedArchive, join(root, 'encrypted-output'), ['aioncore.exe'])).toThrow(
        /Encrypted/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
