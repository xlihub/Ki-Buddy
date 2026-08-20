import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';
import type { ProductResourceOrigin } from '@/common/platform/ki-buddy';
import McpServerItem from '@/renderer/pages/settings/ToolsSettings/McpServerItem';
import McpServerToolsList from '@/renderer/pages/settings/ToolsSettings/McpServerToolsList';

const PROTOCOL_DESCRIPTION = 'Protocol-provided Agents description';
const PRODUCT_DESCRIPTIONS = {
  'en-US': {
    list: 'Lists the complete Agents catalog available to the current signed-in account.',
    describe: 'Shows the exact input and output schema for one agent in the current catalog.',
    invoke: 'Invokes the described Agent once with complete scalar inputs.',
  },
  'zh-CN': {
    list: '列出当前登录账号可用的完整 Agents 目录。',
    describe: '显示当前目录中一个 Agent 的精确输入和输出结构。',
    invoke: '使用完整的标量参数调用一次已描述的 Agent。',
  },
} as const;

const buildServer = (overrides: Partial<IMcpServer> = {}): IMcpServer => ({
  id: 'agents-adapter',
  name: 'agents-mcp-adapter',
  builtin: true,
  enabled: true,
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['/Applications/Ki-Buddy.app/Contents/Resources/app.asar.unpacked/out/main/builtin-mcp-agents.js'],
  },
  tools: [
    { name: 'agents_list', description: PROTOCOL_DESCRIPTION },
    { name: 'agents_describe', description: PROTOCOL_DESCRIPTION },
    { name: 'agents_invoke', description: PROTOCOL_DESCRIPTION },
  ],
  created_at: 0,
  updated_at: 0,
  original_json: '{}',
  ...overrides,
});

async function createTestI18n(language: keyof typeof PRODUCT_DESCRIPTIONS): Promise<typeof i18next> {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en-US',
    resources: Object.fromEntries(
      Object.entries(PRODUCT_DESCRIPTIONS).map(([locale, descriptions]) => [
        locale,
        {
          translation: {
            settings: {
              kiBuddy: {
                agentsListDescription: descriptions.list,
                agentsDescribeDescription: descriptions.describe,
                agentsInvokeDescription: descriptions.invoke,
              },
            },
          },
        },
      ])
    ),
  });
  return i18n;
}

async function renderTools(
  language: keyof typeof PRODUCT_DESCRIPTIONS,
  server: IMcpServer,
  origin?: ProductResourceOrigin
): Promise<void> {
  const i18n = await createTestI18n(language);
  render(
    <I18nextProvider i18n={i18n}>
      <McpServerToolsList server={server} origin={origin} />
    </I18nextProvider>
  );
}

describe('Ki-Buddy Agents MCP tool presentation', () => {
  afterEach(cleanup);

  it('passes the product origin through the MCP server item', async () => {
    const i18n = await createTestI18n('en-US');
    render(
      <I18nextProvider i18n={i18n}>
        <McpServerItem
          server={buildServer()}
          origin='productBuiltin'
          access='use'
          isCollapsed
          isTestingConnection={false}
          onToggleCollapse={() => undefined}
          onTestConnection={() => undefined}
          onEditServer={() => undefined}
          onDeleteServer={() => undefined}
        />
      </I18nextProvider>
    );

    expect(screen.getByText(PRODUCT_DESCRIPTIONS['en-US'].list)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_DESCRIPTIONS['en-US'].describe)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_DESCRIPTIONS['en-US'].invoke)).toBeInTheDocument();
    expect(screen.queryByText(PROTOCOL_DESCRIPTION)).not.toBeInTheDocument();
  });

  it.each(['en-US', 'zh-CN'] as const)('shows the localized Agents description in %s', async (language) => {
    await renderTools(language, buildServer(), 'productBuiltin');

    expect(screen.getByText(PRODUCT_DESCRIPTIONS[language].list)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_DESCRIPTIONS[language].describe)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_DESCRIPTIONS[language].invoke)).toBeInTheDocument();
    expect(screen.queryByText(PROTOCOL_DESCRIPTION)).not.toBeInTheDocument();
  });

  it.each([
    ['without a product origin', undefined, buildServer()],
    ['for a same-name Custom MCP', 'custom' as const, buildServer({ builtin: false })],
    [
      'for another tool',
      'productBuiltin' as const,
      buildServer({ tools: [{ name: 'agents_unknown', description: PROTOCOL_DESCRIPTION }] }),
    ],
  ])('keeps the protocol description %s', async (_scenario, origin, server) => {
    await renderTools('en-US', server, origin);

    expect(screen.getAllByText(PROTOCOL_DESCRIPTION)).not.toHaveLength(0);
  });
});
