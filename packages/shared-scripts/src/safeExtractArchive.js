const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const tar = require('tar');
const yauzl = require('yauzl');

function normalizeArchiveEntry(entryName) {
  if (typeof entryName !== 'string' || !entryName || entryName.includes('\0')) {
    throw new Error('Archive contains an empty or invalid entry name');
  }
  if (entryName.includes('\\') || entryName.startsWith('/') || /^[A-Za-z]:/.test(entryName)) {
    throw new Error(`Archive entry is not a portable relative path: ${entryName}`);
  }

  const segments = entryName.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Archive entry contains an unsafe path segment: ${entryName}`);
  }

  const normalized = path.posix.normalize(entryName);
  if (normalized !== entryName || path.posix.isAbsolute(normalized)) {
    throw new Error(`Archive entry does not normalize safely: ${entryName}`);
  }
  return normalized;
}

function validateEntries(entries, expectedEntries) {
  const expected = new Set(expectedEntries);
  const seen = new Set();

  for (const entry of entries) {
    const normalized = normalizeArchiveEntry(entry.name);
    if (seen.has(normalized)) {
      throw new Error(`Archive contains a duplicate normalized entry: ${normalized}`);
    }
    seen.add(normalized);
    if (!entry.isFile || entry.isSymbolicLink || entry.isHardLink) {
      throw new Error(`Archive entry must be a regular file: ${normalized}`);
    }
    if (!expected.has(normalized)) {
      throw new Error(`Archive contains an unexpected entry: ${normalized}`);
    }
  }

  if (seen.size !== expected.size || [...expected].some((entry) => !seen.has(entry))) {
    throw new Error(`Archive entries do not match the expected file set: ${[...expected].join(', ')}`);
  }
}

async function inspectTarArchive(archivePath) {
  const entries = [];
  await tar.t({
    file: archivePath,
    preservePaths: true,
    strict: true,
    onentry(entry) {
      entries.push({
        name: entry.path,
        isFile: entry.type === 'File' || entry.type === 'OldFile' || entry.type === 'ContiguousFile',
        isSymbolicLink: entry.type === 'SymbolicLink',
        isHardLink: entry.type === 'Link',
      });
    },
  });
  return entries;
}

function openZip(archivePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(
      archivePath,
      {
        autoClose: true,
        decodeStrings: true,
        lazyEntries: true,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (error, archive) => {
        if (error) reject(error);
        else resolve(archive);
      }
    );
  });
}

async function inspectZipArchive(archivePath) {
  const archive = await openZip(archivePath);
  const entries = [];

  await new Promise((resolve, reject) => {
    archive.on('error', reject);
    archive.on('end', resolve);
    archive.on('entry', (entry) => {
      const unixMode = entry.externalFileAttributes >>> 16;
      const fileType = unixMode & 0o170000;
      entries.push({
        name: entry.fileName,
        isFile: !entry.fileName.endsWith('/') && fileType !== 0o040000 && fileType !== 0o120000,
        isSymbolicLink: fileType === 0o120000,
        isHardLink: false,
        encrypted: Boolean(entry.generalPurposeBitFlag & 0x1),
      });
      archive.readEntry();
    });
    archive.readEntry();
  });

  if (entries.some((entry) => entry.encrypted)) {
    throw new Error('Encrypted archive entries are not supported');
  }
  return entries;
}

async function inspectArchive(archivePath) {
  if (archivePath.endsWith('.tar.gz')) return inspectTarArchive(archivePath);
  if (archivePath.endsWith('.zip')) return inspectZipArchive(archivePath);
  throw new Error(`Unsupported archive type: ${path.basename(archivePath)}`);
}

function ensureOutputPath(outputDir, entryName) {
  const outputRoot = path.resolve(outputDir);
  const outputPath = path.resolve(outputRoot, entryName);
  if (outputPath === outputRoot || !outputPath.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`Archive output escapes its temporary directory: ${entryName}`);
  }
  return outputPath;
}

async function extractZipArchive(archivePath, outputDir, expectedEntries) {
  const expected = new Set(expectedEntries);
  const archive = await openZip(archivePath);

  await new Promise((resolve, reject) => {
    let active = false;
    archive.on('error', reject);
    archive.on('end', () => {
      if (!active) resolve();
    });
    archive.on('entry', (entry) => {
      active = true;
      if (!expected.has(entry.fileName)) {
        reject(new Error(`Archive entry changed after validation: ${entry.fileName}`));
        return;
      }
      archive.openReadStream(entry, (error, stream) => {
        if (error) {
          reject(error);
          return;
        }
        const outputPath = ensureOutputPath(outputDir, entry.fileName);
        const output = fs.createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
        stream.on('error', reject);
        output.on('error', reject);
        output.on('finish', () => {
          active = false;
          archive.readEntry();
        });
        stream.pipe(output);
      });
    });
    archive.readEntry();
  });
}

async function verifyExtractedFiles(outputDir, expectedEntries) {
  const actualEntries = await fsPromises.readdir(outputDir, { withFileTypes: true });
  const actualNames = actualEntries.map((entry) => entry.name).toSorted();
  const expectedNames = expectedEntries.toSorted();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error('Extracted archive files do not match the validated entry set');
  }

  await Promise.all(
    expectedEntries.map(async (entryName) => {
      const outputPath = ensureOutputPath(outputDir, entryName);
      const stat = await fsPromises.lstat(outputPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Extracted archive entry is not a regular file: ${entryName}`);
      }
    })
  );
}

async function extractArchiveSafely(archivePath, outputDir, expectedEntries) {
  if (
    !Array.isArray(expectedEntries) ||
    expectedEntries.length === 0 ||
    new Set(expectedEntries).size !== expectedEntries.length
  ) {
    throw new Error('Expected archive entries must be a non-empty unique array');
  }
  if (fs.existsSync(outputDir)) {
    throw new Error(`Archive output directory must not already exist: ${outputDir}`);
  }

  const entries = await inspectArchive(archivePath);
  validateEntries(entries, expectedEntries);

  try {
    await fsPromises.mkdir(outputDir, { recursive: false });
    if (archivePath.endsWith('.tar.gz')) {
      const expected = new Set(expectedEntries);
      await tar.x({
        cwd: outputDir,
        file: archivePath,
        preservePaths: false,
        strict: true,
        filter(entryPath, entry) {
          return expected.has(entryPath) && (entry.type === 'File' || entry.type === 'OldFile');
        },
      });
    } else {
      await extractZipArchive(archivePath, outputDir, expectedEntries);
    }
    await verifyExtractedFiles(outputDir, expectedEntries);
  } catch (error) {
    await fsPromises.rm(outputDir, { force: true, recursive: true });
    throw error;
  }
}

async function main() {
  const [archivePath, outputDir, expectedJson] = process.argv.slice(2);
  if (archivePath === '--inspect') {
    if (!outputDir || expectedJson) throw new Error('Usage: safeExtractArchive.js --inspect <archive>');
    const entries = await inspectArchive(outputDir);
    process.stdout.write(`${JSON.stringify(entries)}\n`);
    return;
  }
  if (!archivePath || !outputDir || !expectedJson) {
    throw new Error('Usage: safeExtractArchive.js <archive> <new-output-dir> <expected-files-json>');
  }
  const expectedEntries = JSON.parse(expectedJson);
  await extractArchiveSafely(archivePath, outputDir, expectedEntries);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  extractArchiveSafely,
  inspectArchive,
  normalizeArchiveEntry,
  validateEntries,
};
