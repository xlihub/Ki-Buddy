import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KI_BUDDY_PRODUCT_CAPABILITY } from '@/common/platform/ki-buddy';
import { ChannelConflictWarning } from '@/renderer/components/agent/ChannelConflictWarning';
import {
  getProductContactUrl,
  getProductDocumentationUrl,
  getProductDownloadUrl,
  getRendererAppVersion,
  getProductSkillsMarketDetailsUrl,
  getRendererBrand,
  initializeRendererBrand,
  installProductAssistantCatalogAdapter,
} from '@/renderer/services/runtime/productBrandRuntime';
import { ipcBridge } from '@/common';
import { configureAssistantPresentationMapper } from '@/common/adapter/ipcBridge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options: Record<string, string> = {}) => {
      const messages: Record<string, string> = {
        'agent.channelConflict.handling': 'OpenClaw is handling {{platformName}} messages, not {{productName}}.',
        'agent.channelConflict.edit': 'Edit:',
        'agent.channelConflict.set': 'Set:',
      };
      return Object.entries(options).reduce(
        (message, [name, value]) => message.replaceAll(`{{${name}}}`, value),
        messages[key] ?? key
      );
    },
  }),
}));

describe('renderer product brand adapter', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '2.1.47');
    vi.stubGlobal('__KI_BUDDY_VERSION__', '0.1.1');
    window.__kiBuddyProductPresentation = null;
    document.documentElement.removeAttribute('data-product');
    document.documentElement.removeAttribute('data-product-theme');
    document.documentElement.setAttribute('data-theme', 'light');
  });

  afterEach(() => {
    configureAssistantPresentationMapper();
    vi.unstubAllGlobals();
  });

  it('preserves the AionUi brand and product links without a capability', () => {
    expect(getRendererBrand().productName).toBe('AionUi');
    expect(getRendererBrand().links.releases).toBe('https://github.com/iOfficeAI/AionUi/releases');
    expect(getProductContactUrl()).toBe('https://x.com/WailiVery');
    expect(getProductDownloadUrl()).toBe('https://www.aionui.com/');
    expect(getRendererAppVersion()).toBe('2.1.47');
  });

  it('preserves upstream documentation destinations without a capability', () => {
    const documentationUrl = 'https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup';
    expect(getProductDocumentationUrl(documentationUrl)).toBe(documentationUrl);
    expect(getProductSkillsMarketDetailsUrl('zh-CN')).toBe('https://github.com/iOfficeAI/AionUi/discussions/1326');
  });

  it('selects configured Ki-Buddy links independently of authentication', () => {
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;

    expect(getRendererBrand().productName).toBe('Ki-Buddy');
    expect(getRendererBrand().links.releases).toBe('https://github.com/xlihub/Ki-Buddy/releases');
    expect(getProductContactUrl()).toBe('https://github.com/xlihub/Ki-Buddy/issues');
    expect(getProductDownloadUrl()).toBe('https://github.com/xlihub/Ki-Buddy/releases');
    expect(getRendererAppVersion()).toBe('0.1.1');
  });

  it('initializes product metadata and the configured light theme', () => {
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;
    document.head.innerHTML = '<link rel="icon" href="old.png">';

    initializeRendererBrand();

    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute('href', expect.stringMatching(/^data:image/));
  });

  it('updates the product theme when appearance changes', async () => {
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;
    document.documentElement.setAttribute('data-product-theme', 'ki-buddy-light');
    initializeRendererBrand();

    document.documentElement.setAttribute('data-theme', 'dark');

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-product-theme', 'ki-buddy-dark'));
  });

  it('uses the selected product in channel conflict instructions', () => {
    window.__kiBuddyProductPresentation = {
      ...KI_BUDDY_PRODUCT_CAPABILITY,
      brand: { ...KI_BUDDY_PRODUCT_CAPABILITY.brand, productName: 'Manifest Buddy' },
    };

    render(<ChannelConflictWarning platform='lark' openclawConfigPath='/tmp/openclaw.json' />);

    expect(screen.getByText('OpenClaw is handling Lark/Feishu messages, not Manifest Buddy.')).toBeInTheDocument();
    expect(screen.getByText('/tmp/openclaw.json')).toBeInTheDocument();
    expect(screen.getByText('channels.feishu.enabled = false')).toBeInTheDocument();
  });

  it('adapts direct assistant bridge responses after one catalog registration', async () => {
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'bare-aionrs',
                source: 'generated',
                name: 'Aion CLI',
                name_i18n: { 'en-US': 'Aion CLI' },
                avatar: '/api/assets/logos/aionui.svg',
                agent: { type: 'aionrs', source: 'internal' },
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 }
        )
      )
    );
    installProductAssistantCatalogAdapter();

    const assistants = await ipcBridge.assistants.list.invoke();

    expect(assistants[0]).toMatchObject({ name: 'Ki CLI', name_i18n: { 'en-US': 'Ki CLI' } });
    expect(assistants[0]?.avatar).toMatch(/^data:image\/png;base64,/);
  });

  it('keeps direct assistant bridge responses unchanged without the product capability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'bare-aionrs',
                source: 'generated',
                name: 'Aion CLI',
                name_i18n: { 'en-US': 'Aion CLI' },
                avatar: '/api/assets/logos/aionui.svg',
                agent: { type: 'aionrs', source: 'internal' },
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 }
        )
      )
    );
    installProductAssistantCatalogAdapter();

    const assistants = await ipcBridge.assistants.list.invoke();

    expect(assistants[0]).toMatchObject({ name: 'Aion CLI', avatar: '/api/assets/logos/aionui.svg' });
  });

  it('does not replace an existing assistant mapper when the product capability is absent', async () => {
    configureAssistantPresentationMapper({
      list: (assistants) => assistants.map((assistant) => ({ ...assistant, name: 'Existing mapper' })),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'assistant-1',
                source: 'custom',
                name: 'Original',
                agent: { type: 'acp', source: 'custom' },
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 }
        )
      )
    );

    installProductAssistantCatalogAdapter();

    await expect(ipcBridge.assistants.list.invoke()).resolves.toMatchObject([{ name: 'Existing mapper' }]);
  });

  it('adapts assistant detail responses at the same catalog boundary', async () => {
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              id: 'bare-aionrs',
              source: 'generated',
              profile: {
                name: 'Aion CLI',
                name_i18n: { 'en-US': 'Aion CLI' },
                avatar: '/api/assets/logos/aionui.svg',
              },
              engine: { agent: { type: 'aionrs', source: 'internal' } },
            },
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 }
        )
      )
    );
    installProductAssistantCatalogAdapter();

    const detail = await ipcBridge.assistants.get.invoke({ id: 'bare-aionrs' });

    expect(detail.profile).toMatchObject({ name: 'Ki CLI', name_i18n: { 'en-US': 'Ki CLI' } });
    expect(detail.profile.avatar).toMatch(/^data:image\/png;base64,/);
  });
});
