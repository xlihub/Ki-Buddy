const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readKiCorePin } = require('./kiCoreRelease');

const KI_BUDDY_PRODUCT = 'Ki-Buddy';
const KI_BUDDY_REPOSITORY = 'xlihub/Ki-Buddy';
const AION_UI_REPOSITORY = 'iOfficeAI/AionUi';
const PRODUCT_CONFIG_FILE = 'ki-buddy-product.json';
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PACKAGE_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SHA40_PATTERN = /^[0-9a-f]{40}$/;

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

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

function readProductVersion(projectRoot) {
  const version = fs.readFileSync(path.join(projectRoot, 'ki-buddy-version.txt'), 'utf8').trim();
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error('ki-buddy-version.txt must contain one stable SemVer version');
  }
  return version;
}

function readProductConfig(projectRoot) {
  const config = readJson(path.join(projectRoot, PRODUCT_CONFIG_FILE), 'Ki-Buddy product configuration');
  requireExactKeys(
    config,
    ['schemaVersion', 'defaults', 'packageMetadata', 'electronBuilder', 'webCli', 'updates', 'kiCore'],
    'Ki-Buddy product configuration'
  );
  if (config.schemaVersion !== 1) throw new Error('Unsupported Ki-Buddy product configuration schema');
  requireExactKeys(config.defaults, ['agentsBaseUrl', 'language'], 'Ki-Buddy product defaults');
  if (config.defaults.agentsBaseUrl !== 'https://ksapi.kingsware.cn') {
    throw new Error('Ki-Buddy default Agents base URL must use the public production deployment');
  }
  if (config.defaults.language !== 'zh-CN') {
    throw new Error('Ki-Buddy default language must be zh-CN');
  }
  requireExactKeys(
    config.packageMetadata,
    ['name', 'description', 'author', 'repository', 'homepage', 'bugs', 'productName'],
    'Ki-Buddy package metadata'
  );
  if (config.packageMetadata.name !== 'ki-buddy' || config.packageMetadata.productName !== KI_BUDDY_PRODUCT) {
    throw new Error('Ki-Buddy package metadata identity is invalid');
  }
  requireExactKeys(
    config.electronBuilder,
    ['appId', 'productName', 'executableName', 'copyright', 'protocols', 'publish', 'linux'],
    'Ki-Buddy electron-builder configuration'
  );
  if (
    config.electronBuilder.appId !== 'com.xlihub.ki-buddy' ||
    config.electronBuilder.productName !== KI_BUDDY_PRODUCT ||
    config.electronBuilder.executableName !== KI_BUDDY_PRODUCT
  ) {
    throw new Error('Ki-Buddy desktop application identity is invalid');
  }
  const schemes = config.electronBuilder.protocols?.flatMap((protocol) => protocol?.schemes || []);
  if (!Array.isArray(schemes) || !schemes.includes('ki-buddy') || schemes.includes('aionui')) {
    throw new Error('Ki-Buddy protocol configuration must contain only the independent product protocol');
  }
  if (
    config.electronBuilder.publish?.provider !== 'github' ||
    `${config.electronBuilder.publish?.owner}/${config.electronBuilder.publish?.repo}` !== KI_BUDDY_REPOSITORY ||
    config.electronBuilder.publish?.tagNamePrefix !== 'ki-buddy-v'
  ) {
    throw new Error('Ki-Buddy electron-builder publish identity is invalid');
  }
  requireExactKeys(
    config.webCli,
    ['packageName', 'archiveName', 'bundleDirectory', 'executableName'],
    'Ki-Buddy web CLI configuration'
  );
  if (config.webCli.packageName !== 'ki-buddy-web' || config.webCli.archiveName !== 'ki-buddy-web') {
    throw new Error('Ki-Buddy web CLI identity is invalid');
  }
  requireExactKeys(
    config.updates,
    ['provider', 'repository', 'tagPrefix', 'releasePageUrl'],
    'Ki-Buddy update configuration'
  );
  if (
    config.updates.provider !== 'github' ||
    config.updates.repository !== KI_BUDDY_REPOSITORY ||
    config.updates.tagPrefix !== 'ki-buddy-v' ||
    config.updates.releasePageUrl !== 'https://github.com/xlihub/Ki-Buddy/releases'
  ) {
    throw new Error('Ki-Buddy update configuration is invalid');
  }
  return config;
}

function createEffectivePackageJson(projectRoot, options = {}) {
  const upstreamPackage = readJson(path.join(projectRoot, 'package.json'), 'AionUi package.json');
  const productConfig = readProductConfig(projectRoot);
  const version = options.version || readProductVersion(projectRoot);
  if (!PACKAGE_VERSION_PATTERN.test(version)) throw new Error('Effective Ki-Buddy package version must be SemVer');
  return {
    ...upstreamPackage,
    ...productConfig.packageMetadata,
    version,
  };
}

function createElectronBuilderConfig(projectRoot, outputPath, options = {}) {
  const productConfig = readProductConfig(projectRoot);
  const effectivePackage = createEffectivePackageJson(projectRoot, options);
  const config = {
    extends: path.join(projectRoot, 'packages/desktop/electron-builder.yml'),
    ...productConfig.electronBuilder,
    extraMetadata: Object.fromEntries(
      ['name', 'version', 'description', 'author', 'repository', 'homepage', 'bugs', 'productName'].map((key) => [
        key,
        effectivePackage[key],
      ])
    ),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

function validateAionUi(aionUi) {
  requireExactKeys(aionUi, ['repository', 'tag', 'commit'], 'AionUi mapping');
  if (aionUi.repository !== AION_UI_REPOSITORY) {
    throw new Error(`AionUi mapping repository must be ${AION_UI_REPOSITORY}`);
  }
  if (!/^v\d+\.\d+\.\d+$/.test(aionUi.tag)) {
    throw new Error('AionUi mapping tag must use the full vX.Y.Z form');
  }
  if (!SHA40_PATTERN.test(aionUi.commit)) {
    throw new Error('AionUi mapping commit must be a full lowercase commit SHA');
  }
}

function validateMappedAionCore(aionCore) {
  requireExactKeys(aionCore, ['repository', 'tag', 'commit'], 'AionCore mapping');
  if (aionCore.repository !== 'iOfficeAI/AionCore') {
    throw new Error('AionCore mapping repository must be iOfficeAI/AionCore');
  }
  if (!/^v\d+\.\d+\.\d+$/.test(aionCore.tag)) {
    throw new Error('AionCore mapping tag must use the full vX.Y.Z form');
  }
  if (!SHA40_PATTERN.test(aionCore.commit)) {
    throw new Error('AionCore mapping commit must be a full lowercase commit SHA');
  }
}

function validateMappedKiCore(kiCore) {
  requireExactKeys(kiCore, ['repository', 'version', 'tag', 'commit', 'aionCore'], 'Ki-Core mapping');
  if (kiCore.repository !== 'xlihub/Ki-Core') {
    throw new Error('Ki-Core mapping repository must be xlihub/Ki-Core');
  }
  if (!SEMVER_PATTERN.test(kiCore.version) || kiCore.tag !== `ki-core-v${kiCore.version}`) {
    throw new Error('Ki-Core mapping version and tag do not match');
  }
  if (!SHA40_PATTERN.test(kiCore.commit)) {
    throw new Error('Ki-Core mapping commit must be a full lowercase commit SHA');
  }
  validateMappedAionCore(kiCore.aionCore);
}

function readReleaseMapping(projectRoot, version) {
  const mapping = readJson(path.join(projectRoot, 'ki-buddy-release.json'), 'Ki-Buddy release mapping');
  requireExactKeys(mapping, ['schemaVersion', 'product', 'repository', 'release'], 'Ki-Buddy release mapping');
  if (mapping.schemaVersion !== 1) throw new Error('Unsupported Ki-Buddy release mapping schema');
  if (mapping.product !== KI_BUDDY_PRODUCT || mapping.repository !== KI_BUDDY_REPOSITORY) {
    throw new Error('Ki-Buddy release mapping product identity is invalid');
  }
  const release = mapping.release;
  requireExactKeys(release, ['version', 'tag', 'aionUi', 'kiCore'], 'Ki-Buddy release entry');
  if (!SEMVER_PATTERN.test(release.version) || release.tag !== `ki-buddy-v${release.version}`) {
    throw new Error('Ki-Buddy release mapping version and tag do not match');
  }
  if (release.version !== version) {
    throw new Error(`Ki-Buddy release mapping must describe current version ${version}`);
  }
  validateAionUi(release.aionUi);
  validateMappedKiCore(release.kiCore);
  return release;
}

function validateCorePin(projectRoot, versionEntry) {
  const pin = readKiCorePin(projectRoot);
  const mapped = versionEntry.kiCore;
  if (
    pin.repository !== mapped.repository ||
    pin.tag !== mapped.tag ||
    pin.commit !== mapped.commit ||
    pin.aionCore.repository !== mapped.aionCore.repository ||
    pin.aionCore.tag !== mapped.aionCore.tag ||
    pin.aionCore.peeledCommit !== mapped.aionCore.commit
  ) {
    throw new Error('Ki-Buddy product Ki-Core pin does not match the current version mapping');
  }
}

function readReleaseContext(versionEntry, env) {
  const explicitTag = String(env.KI_BUDDY_RELEASE_TAG || '').trim();
  const githubTag = String(env.GITHUB_REF || '').startsWith('refs/tags/')
    ? String(env.GITHUB_REF_NAME || env.GITHUB_REF.slice('refs/tags/'.length)).trim()
    : '';
  const releaseTag = explicitTag || githubTag;
  const releaseCommit = String(env.KI_BUDDY_RELEASE_COMMIT || (releaseTag ? env.GITHUB_SHA : '') || '').trim();

  if (releaseTag && releaseTag !== versionEntry.tag) {
    throw new Error(`Release tag ${releaseTag} does not match mapped tag ${versionEntry.tag}`);
  }
  if (releaseTag && !SHA40_PATTERN.test(releaseCommit)) {
    throw new Error('A Ki-Buddy release tag requires a full lowercase release commit SHA');
  }
  if (!releaseTag && releaseCommit) {
    throw new Error('Ki-Buddy release commit cannot be set without a release tag');
  }
  return { releaseCommit: releaseCommit || null, releaseTag: releaseTag || null };
}

function validateChangelog(projectRoot, version) {
  const changelog = fs.readFileSync(path.join(projectRoot, 'CHANGELOG.ki-buddy.md'), 'utf8');
  const heading = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`, 'm');
  if (!heading.test(changelog)) {
    throw new Error(`CHANGELOG.ki-buddy.md is missing the ${version} release entry`);
  }
  for (const section of ['Ki-Buddy 定制变化', 'AionUi 上游更新', 'Ki-Core 更新']) {
    if (!changelog.includes(`### ${section}`)) {
      throw new Error(`CHANGELOG.ki-buddy.md is missing section: ${section}`);
    }
  }
  return changelog;
}

function verifyAionUiTag(projectRoot, versionEntry) {
  let commit;
  try {
    commit = execFileSync('git', ['rev-parse', `${versionEntry.aionUi.tag}^{commit}`], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new Error(`Cannot resolve mapped AionUi tag ${versionEntry.aionUi.tag}`, { cause: error });
  }
  if (commit !== versionEntry.aionUi.commit) {
    throw new Error(`AionUi tag ${versionEntry.aionUi.tag} does not resolve to the mapped commit`);
  }
}

function verifyUpstreamPackageJson(projectRoot, aionUi) {
  let upstreamPackage;
  try {
    upstreamPackage = execFileSync('git', ['show', `${aionUi.commit}:package.json`], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`Cannot read package.json from mapped AionUi commit ${aionUi.commit}`, { cause: error });
  }
  const currentPackage = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
  if (currentPackage !== upstreamPackage) {
    throw new Error('Root package.json must be byte-identical to the mapped AionUi commit');
  }
}

function readKiBuddyRelease(projectRoot, env = process.env) {
  const version = readProductVersion(projectRoot);
  readProductConfig(projectRoot);
  const versionEntry = readReleaseMapping(projectRoot, version);
  validateCorePin(projectRoot, versionEntry);
  validateChangelog(projectRoot, version);
  const release = readReleaseContext(versionEntry, env);
  return {
    kiBuddy: {
      repository: KI_BUDDY_REPOSITORY,
      version,
      tag: versionEntry.tag,
      releaseCommit: release.releaseCommit,
    },
    aionUi: { ...versionEntry.aionUi },
    kiCore: {
      repository: versionEntry.kiCore.repository,
      version: versionEntry.kiCore.version,
      tag: versionEntry.kiCore.tag,
      releaseCommit: versionEntry.kiCore.commit,
    },
    aionCore: {
      repository: versionEntry.kiCore.aionCore.repository,
      tag: versionEntry.kiCore.aionCore.tag,
      peeledCommit: versionEntry.kiCore.aionCore.commit,
    },
  };
}

function verifyKiBuddyRelease(projectRoot, options = {}) {
  const env = { ...process.env };
  if (options.tag) env.KI_BUDDY_RELEASE_TAG = options.tag;
  if (options.commit) env.KI_BUDDY_RELEASE_COMMIT = options.commit;
  const identity = readKiBuddyRelease(projectRoot, env);
  if (!options.skipGit) {
    verifyAionUiTag(projectRoot, { aionUi: identity.aionUi });
    verifyUpstreamPackageJson(projectRoot, identity.aionUi);
  }
  return identity;
}

function extractReleaseNotes(projectRoot, version) {
  const changelog = validateChangelog(projectRoot, version);
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\]`).test(line));
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## ['));
  return `${lines
    .slice(start, end === -1 ? lines.length : end)
    .join('\n')
    .trim()}\n`;
}

function parseCliArgs(args) {
  const [command = 'verify', ...rest] = args;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || ''}`);
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function runCli() {
  const projectRoot = path.resolve(__dirname, '../../..');
  const { command, options } = parseCliArgs(process.argv.slice(2));
  if (command === 'verify') {
    const identity = verifyKiBuddyRelease(projectRoot, {
      commit: options.commit,
      skipGit: options['skip-git'] === 'true',
      tag: options.tag,
    });
    process.stdout.write(`${JSON.stringify(identity, null, 2)}\n`);
    return;
  }
  if (command === 'notes') {
    const version = options.version || readProductVersion(projectRoot);
    const notes = extractReleaseNotes(projectRoot, version);
    if (!options.output) throw new Error('notes command requires --output');
    fs.writeFileSync(path.resolve(options.output), notes, 'utf8');
    return;
  }
  if (command === 'builder-config') {
    if (!options.output) throw new Error('builder-config command requires --output');
    createElectronBuilderConfig(projectRoot, path.resolve(options.output), {
      version: options.version,
    });
    return;
  }
  throw new Error(`Unsupported Ki-Buddy release command: ${command}`);
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  createEffectivePackageJson,
  createElectronBuilderConfig,
  extractReleaseNotes,
  readKiBuddyRelease,
  readProductConfig,
  readProductVersion,
  readReleaseMapping,
  verifyKiBuddyRelease,
};
