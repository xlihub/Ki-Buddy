import { describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';

const {
  createEffectivePackageJson,
  createElectronBuilderConfig,
  readKiBuddyRelease,
  readProductConfig,
  readProductVersion,
  verifyKiBuddyRelease,
  verifyProductPackageJson,
} = require('../../../packages/shared-scripts/src/kiBuddyRelease');

const projectRoot = resolve(__dirname, '../../..');

function readPngDimensions(relativePath: string): { height: number; width: number } {
  const data = readFileSync(join(projectRoot, relativePath));
  expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe('Ki-Buddy product release identity', () => {
  it('validates the current product mapping without requiring repository history', () => {
    expect(() => verifyKiBuddyRelease(projectRoot, { skipGit: true })).not.toThrow();
  });

  it('allows only declared product dependencies in the upstream package comparison', () => {
    const upstreamPackage = { name: 'AionUi', dependencies: { react: '^19.0.0' } };
    const currentPackage = {
      name: 'AionUi',
      dependencies: { react: '^19.0.0', keytar: '^7.9.0' },
    };

    expect(() => verifyProductPackageJson(currentPackage, upstreamPackage, { keytar: '^7.9.0' })).not.toThrow();
    expect(() =>
      verifyProductPackageJson({ ...currentPackage, name: 'Ki-Buddy' }, upstreamPackage, { keytar: '^7.9.0' })
    ).toThrow('only by declared product dependencies');
    expect(() =>
      verifyProductPackageJson(
        { ...currentPackage, dependencies: { ...currentPackage.dependencies, keytar: '^8.0.0' } },
        upstreamPackage,
        { keytar: '^7.9.0' }
      )
    ).toThrow('must match the product configuration');
  });

  it('stores only the current product release mapping', () => {
    const mapping = JSON.parse(readFileSync(join(projectRoot, 'ki-buddy-release.json'), 'utf8'));

    expect(mapping).not.toHaveProperty('versions');
    expect(mapping.release.version).toBe(readProductVersion(projectRoot));
  });

  it('keeps the Ki-Buddy defaults in the product configuration', () => {
    const config = readProductConfig(projectRoot);
    expect(config.defaults).toEqual({
      agentsBaseUrl: 'https://ksapi.kingsware.cn',
      language: 'zh-CN',
    });
    expect(config.brand.cliName).toBe('Ki CLI');
    expect(config.locale).toEqual({ namespace: 'kiBuddy' });
    expect(config.themes).toEqual({ light: 'ki-buddy-light', dark: 'ki-buddy-dark' });
  });

  it('declares existing independent platform and renderer brand resources', () => {
    const config = readProductConfig(projectRoot);
    for (const relativePath of Object.values(config.assets.platform)) {
      expect(existsSync(join(projectRoot, relativePath))).toBe(true);
    }
    expect(config.assets.renderer).toEqual({ logo: 'ki-buddy-app', mascot: 'ki-buddy-mascot' });
    expect(readPngDimensions(config.assets.platform.png)).toEqual({ width: 1024, height: 1024 });
    expect(readFileSync(join(projectRoot, config.assets.platform.ico)).subarray(0, 4).toString('hex')).toBe('00000100');
    expect(readFileSync(join(projectRoot, config.assets.platform.icns)).subarray(0, 4).toString('ascii')).toBe('icns');
    expect(readPngDimensions('packages/desktop/src/renderer/assets/ki-buddy/app.png')).toEqual({
      width: 128,
      height: 128,
    });
    expect(readPngDimensions('packages/desktop/src/renderer/assets/ki-buddy/mascot.png')).toEqual({
      width: 256,
      height: 256,
    });
  });

  it('rejects malformed runtime identity and product defaults', () => {
    const source = JSON.parse(readFileSync(join(projectRoot, 'ki-buddy-product.json'), 'utf8'));
    for (const mutate of [
      (config: typeof source) => {
        config.runtimeIdentity = '';
      },
      (config: typeof source) => {
        config.defaults.agentsBaseUrl = 'ftp://agents.example.com';
      },
      (config: typeof source) => {
        config.defaults.language = '';
      },
      (config: typeof source) => {
        config.locale.namespace = '';
      },
      (config: typeof source) => {
        config.themes.dark = '';
      },
      (config: typeof source) => {
        config.electronBuilder.protocols[0].schemes.push('unexpected');
      },
      (config: typeof source) => {
        config.electronBuilder.protocols[0].unexpected = true;
      },
      (config: typeof source) => {
        delete config.electronBuilder.protocols[0].name;
      },
      (config: typeof source) => {
        config.electronBuilder.publish.unexpected = true;
      },
      (config: typeof source) => {
        delete config.electronBuilder.publish.owner;
      },
      (config: typeof source) => {
        config.electronBuilder.linux.unexpected = true;
      },
      (config: typeof source) => {
        delete config.electronBuilder.linux.maintainer;
      },
      (config: typeof source) => {
        config.electronBuilder.linux.desktop.unexpected = true;
      },
      (config: typeof source) => {
        config.electronBuilder.linux.desktop.entry.unexpected = true;
      },
      (config: typeof source) => {
        delete config.electronBuilder.linux.desktop.entry.Name;
      },
      (config: typeof source) => {
        config.brand.productName = 'Wrong Product';
      },
      (config: typeof source) => {
        config.packageMetadata.author = null;
      },
      (config: typeof source) => {
        config.packageMetadata.repository.url = 'ftp://github.com/xlihub/Ki-Buddy.git';
      },
      (config: typeof source) => {
        config.packageMetadata.homepage = '/readme';
      },
      (config: typeof source) => {
        config.packageMetadata.bugs = null;
      },
    ]) {
      const tempDir = mkdtempSync(join(tmpdir(), 'ki-buddy-product-config-'));
      try {
        const config = structuredClone(source);
        mutate(config);
        writeFileSync(join(tempDir, 'ki-buddy-product.json'), JSON.stringify(config));
        expect(() => readProductConfig(tempDir)).toThrow();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it('rejects unknown product configuration fields at the build boundary', () => {
    const source = JSON.parse(readFileSync(join(projectRoot, 'ki-buddy-product.json'), 'utf8'));
    const tempDir = mkdtempSync(join(tmpdir(), 'ki-buddy-product-config-'));
    try {
      source.unexpected = true;
      writeFileSync(join(tempDir, 'ki-buddy-product.json'), JSON.stringify(source));
      expect(() => readProductConfig(tempDir)).toThrow('unexpected or missing fields');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects a release mapping that does not describe the current product version', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ki-buddy-release-mapping-'));
    try {
      for (const file of [
        'ki-buddy-product.json',
        'ki-buddy-version.txt',
        'ki-buddy-release.json',
        'CHANGELOG.ki-buddy.md',
      ]) {
        copyFileSync(join(projectRoot, file), join(tempDir, file));
      }
      writeFileSync(join(tempDir, 'ki-buddy-version.txt'), '9.9.9\n');

      expect(() => readKiBuddyRelease(tempDir)).toThrow('Ki-Buddy release mapping must describe current version 9.9.9');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('combines upstream package data with independent Ki-Buddy product metadata', () => {
    const upstreamPackage = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    const productConfig = readProductConfig(projectRoot);
    const productVersion = readProductVersion(projectRoot);
    const effectivePackage = createEffectivePackageJson(projectRoot);

    expect(effectivePackage).toMatchObject({
      ...productConfig.packageMetadata,
      productRuntime: 'ki-buddy',
      version: productVersion,
      main: upstreamPackage.main,
      dependencies: upstreamPackage.dependencies,
    });
    expect(effectivePackage.name).not.toBe(upstreamPackage.name);
    expect(effectivePackage.productName).not.toBe(upstreamPackage.productName);
  });

  it('generates the final electron-builder overlay without modifying package.json', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ki-buddy-builder-config-'));
    const outputPath = join(tempDir, 'electron-builder.json');
    const originalPackage = readFileSync(join(projectRoot, 'package.json'), 'utf8');
    try {
      const config = createElectronBuilderConfig(projectRoot, outputPath);
      const productConfig = readProductConfig(projectRoot);
      const productVersion = readProductVersion(projectRoot);
      expect(config).toMatchObject({
        ...productConfig.electronBuilder,
        win: { icon: 'resources/ki-buddy/app.ico', target: ['nsis'] },
        mac: { icon: 'resources/ki-buddy/app.icns', target: ['dmg', 'zip'] },
        linux: { ...productConfig.electronBuilder.linux, icon: 'resources/ki-buddy/app.png' },
        extraMetadata: {
          ...productConfig.packageMetadata,
          productRuntime: 'ki-buddy',
          version: productVersion,
        },
      });
      expect(config).not.toHaveProperty('extends');
      expect(config.protocols).toEqual(productConfig.electronBuilder.protocols);
      const upstreamBuilder = loadYaml(
        readFileSync(join(projectRoot, 'packages/desktop/electron-builder.yml'), 'utf8')
      ) as { extraResources: Array<{ from: string; to: string }> };
      const expectedResources = upstreamBuilder.extraResources.map((resource) =>
        resource.to === 'app.png' ? Object.assign({}, resource, { from: productConfig.assets.platform.png }) : resource
      );
      expectedResources.push({ from: productConfig.assets.platform.png, to: productConfig.assets.packaged.icon });
      expect(config.extraResources).toEqual(expectedResources);
      expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(config);
      expect(readFileSync(join(projectRoot, 'package.json'), 'utf8')).toBe(originalPackage);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('records the full AionUi, Ki-Core and AionCore mapping', () => {
    const identity = readKiBuddyRelease(projectRoot);
    expect(identity.kiBuddy.tag).toBe(`ki-buddy-v${identity.kiBuddy.version}`);
    expect(identity.kiCore.tag).toBe(`ki-core-v${identity.kiCore.version}`);
    expect(identity.aionUi.tag).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(identity.aionUi.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(identity.aionCore.tag).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(identity.aionCore.peeledCommit).toMatch(/^[0-9a-f]{40}$/);
  });
});
