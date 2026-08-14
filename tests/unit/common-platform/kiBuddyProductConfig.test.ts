import { describe, expect, it } from 'vitest';
import { KI_BUDDY_DEFAULT_AGENTS_BASE_URL, parseKiBuddyProductConfig } from '@/common/platform/ki-buddy';

const validConfig = {
  schemaVersion: 2,
  runtimeIdentity: 'ki-buddy',
  defaults: { agentsBaseUrl: 'https://agents.example.com', language: 'zh-CN' },
  electronBuilder: {
    appId: 'com.xlihub.ki-buddy',
    protocols: [{ name: 'Ki-Buddy Protocol', schemes: ['ki-buddy'] }],
  },
  locale: { namespace: 'kiBuddy' },
  themes: { light: 'ki-buddy-light', dark: 'ki-buddy-dark' },
  updates: {
    provider: 'github',
    repository: 'xlihub/Ki-Buddy',
    tagPrefix: 'ki-buddy-v',
    releasePageUrl: 'https://github.com/xlihub/Ki-Buddy/releases',
  },
  brand: {
    productName: 'Ki-Buddy',
    shortName: 'Ki-Buddy',
    cliName: 'Ki CLI',
    description: 'AI agent desktop workspace',
    links: {
      homepage: 'https://github.com/xlihub/Ki-Buddy',
      repository: 'https://github.com/xlihub/Ki-Buddy',
      releases: 'https://github.com/xlihub/Ki-Buddy/releases',
      support: 'https://github.com/xlihub/Ki-Buddy/issues',
      feedback: 'https://github.com/xlihub/Ki-Buddy/issues/new',
    },
  },
  assets: {
    platform: {
      png: 'resources/ki-buddy/app.png',
      ico: 'resources/ki-buddy/app.ico',
      icns: 'resources/ki-buddy/app.icns',
    },
    packaged: { icon: 'ki-buddy/app.png' },
    renderer: { logo: 'ki-buddy-app', mascot: 'ki-buddy-mascot' },
  },
} as const;

describe('Ki-Buddy product configuration', () => {
  it('uses the public Agents deployment by default', () => {
    expect(KI_BUDDY_DEFAULT_AGENTS_BASE_URL).toBe('https://ksapi.kingsware.cn');
  });

  it.each([
    '',
    'ftp://agents.example.com',
    'https://user:secret@agents.example.com',
    'https://agents.example.com?token=secret',
    'https://agents.example.com#fragment',
  ])('rejects invalid default deployment URL %s', (agentsBaseUrl) => {
    expect(() =>
      parseKiBuddyProductConfig({
        ...validConfig,
        defaults: { agentsBaseUrl, language: 'zh-CN' },
      })
    ).toThrow('Agents base URL');
  });

  it('rejects an unsupported product language instead of silently disabling the default', () => {
    expect(() =>
      parseKiBuddyProductConfig({
        ...validConfig,
        defaults: { agentsBaseUrl: 'https://agents.example.com', language: 'unsupported' },
      })
    ).toThrow('default language');
  });

  it('exposes the validated brand and assets', () => {
    expect(parseKiBuddyProductConfig(validConfig)).toMatchObject({
      schemaVersion: 2,
      brand: {
        productName: 'Ki-Buddy',
        cliName: 'Ki CLI',
        links: { support: 'https://github.com/xlihub/Ki-Buddy/issues' },
      },
      assets: {
        packaged: { icon: 'ki-buddy/app.png' },
        renderer: { logo: 'ki-buddy-app', mascot: 'ki-buddy-mascot' },
      },
      electronBuilder: { appId: 'com.xlihub.ki-buddy', protocolScheme: 'ki-buddy' },
      locale: { namespace: 'kiBuddy' },
      themes: { light: 'ki-buddy-light', dark: 'ki-buddy-dark' },
    });
  });

  it('rejects unknown runtime product fields', () => {
    expect(() => parseKiBuddyProductConfig({ ...validConfig, unexpected: true })).toThrow('unexpected unexpected');
  });

  it('rejects missing theme resources at startup', () => {
    const { themes: _themes, ...withoutThemes } = validConfig;
    expect(() => parseKiBuddyProductConfig(withoutThemes)).toThrow('missing themes');
  });

  it('rejects malformed or unsupported product presentation resources at startup', () => {
    expect(() =>
      parseKiBuddyProductConfig({
        ...validConfig,
        assets: { ...validConfig.assets, renderer: { logo: 'unknown-logo', mascot: 'ki-buddy-mascot' } },
      })
    ).toThrow('renderer logo asset');
    expect(() =>
      parseKiBuddyProductConfig({ ...validConfig, themes: { light: 'unknown-light', dark: 'ki-buddy-dark' } })
    ).toThrow('light theme');
  });

  it('rejects malformed product protocol configuration at startup', () => {
    expect(() =>
      parseKiBuddyProductConfig({
        ...validConfig,
        electronBuilder: { ...validConfig.electronBuilder, protocols: [] },
      })
    ).toThrow('protocol');
    expect(() =>
      parseKiBuddyProductConfig({
        ...validConfig,
        electronBuilder: {
          ...validConfig.electronBuilder,
          protocols: [{ name: 'Ki-Buddy Protocol', schemes: ['not valid'] }],
        },
      })
    ).toThrow('protocol scheme');
  });

  it('rejects unknown nested brand fields', () => {
    expect(() =>
      parseKiBuddyProductConfig({ ...validConfig, brand: { ...validConfig.brand, alias: 'Buddy' } })
    ).toThrow('Ki-Buddy brand has invalid fields');
  });

  it('rejects a product link that is not an absolute HTTP(S) URL', () => {
    expect(() =>
      parseKiBuddyProductConfig({
        ...validConfig,
        brand: { ...validConfig.brand, links: { ...validConfig.brand.links, support: '/support' } },
      })
    ).toThrow('brand link');
  });

  it('rejects an update source that does not match the product repository', () => {
    expect(() =>
      parseKiBuddyProductConfig({
        ...validConfig,
        updates: { ...validConfig.updates, repository: 'iOfficeAI/AionUi' },
      })
    ).toThrow('update source');
  });
});
