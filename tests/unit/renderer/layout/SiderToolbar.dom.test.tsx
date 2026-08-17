import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover', () => ({
  default: () => null,
}));
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Tooltip: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => (
      <div>
        <span>{content}</span>
        {children}
      </div>
    ),
  };
});
vi.mock('@icon-park/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icon-park/react')>();
  return {
    ...actual,
    ListCheckbox: () => <span />,
    Plus: () => <span />,
  };
});

import { SiderToolbar } from '@/renderer/components/layout/Sider/SiderNav';

function renderToolbar(showHistoryActions?: boolean): void {
  render(
    <SiderToolbar
      isMobile={false}
      isBatchMode={false}
      collapsed={false}
      siderTooltipProps={{}}
      onNewChat={vi.fn()}
      onToggleBatchMode={vi.fn()}
      showHistoryActions={showHistoryActions}
    />
  );
}

describe('SiderToolbar history action', () => {
  it.each([
    ['the AionUi default', undefined, true],
    ['enabled history', true, true],
    ['disabled history', false, false],
  ] as const)('%s controls the batch history action', (_case, showHistoryActions, expectedVisible) => {
    renderToolbar(showHistoryActions);

    const historyAction = screen.queryByText('conversation.history.batchManage');
    if (expectedVisible) expect(historyAction).toBeInTheDocument();
    else expect(historyAction).not.toBeInTheDocument();
  });
});
