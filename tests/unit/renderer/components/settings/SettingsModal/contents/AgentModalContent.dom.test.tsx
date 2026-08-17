/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { expect, it, vi } from 'vitest';

vi.mock('@/renderer/pages/settings/AgentSettings/LocalAgents', () => ({
  default: () => <div>Projected Agent directory</div>,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children, disableOverflow }: { children: React.ReactNode; disableOverflow?: boolean }) => (
    <div data-disable-overflow={String(disableOverflow)}>{children}</div>
  ),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

import AgentModalContent from '@/renderer/components/settings/SettingsModal/contents/AgentModalContent';

it('mounts the shared Agent settings directory in page mode', () => {
  render(<AgentModalContent />);

  expect(screen.getByText('Projected Agent directory')).toBeInTheDocument();
  expect(screen.getByText('Projected Agent directory').parentElement).toHaveAttribute('data-disable-overflow', 'true');
});
