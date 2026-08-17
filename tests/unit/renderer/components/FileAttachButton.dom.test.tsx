/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { projectedSkills, preserveLoadedSkillNames, catalogError, useSWRMock } = vi.hoisted(() => ({
  projectedSkills: { current: [] as Array<{ name: string; description: string }> | undefined },
  preserveLoadedSkillNames: { current: false },
  catalogError: { current: undefined as Error | undefined },
  useSWRMock: vi.fn(),
}));

vi.mock('swr', () => ({
  default: (...args: unknown[]) => useSWRMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => null,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
}));

vi.mock('@/renderer/services/runtime/kiBuddySkillCatalog', () => ({
  loadProductSkillCatalog: vi.fn(),
  filterProductVisibleSkillNames: (
    names: readonly string[] | undefined,
    skills: readonly { name: string }[] | undefined
  ) => {
    if (!skills) return preserveLoadedSkillNames.current ? [...(names ?? [])] : [];
    const visibleNames = new Set(skills.map(({ name }) => name));
    return (names ?? []).filter((name) => visibleNames.has(name));
  },
}));

import FileAttachButton from '@/renderer/components/media/FileAttachButton';

describe('FileAttachButton product Skill catalog', () => {
  beforeEach(() => {
    projectedSkills.current = [];
    preserveLoadedSkillNames.current = false;
    catalogError.current = undefined;
    useSWRMock.mockReset();
    useSWRMock.mockImplementation((key: string | null) => ({
      data: key ? projectedSkills.current : undefined,
      error: key ? catalogError.current : undefined,
    }));
  });

  it('filters the attachment Skill menu to the product-visible catalog', async () => {
    projectedSkills.current = [{ name: 'officecli-docx', description: 'Word documents' }];

    render(
      <FileAttachButton
        openFileSelector={vi.fn()}
        loadedSkills={['officecli-docx', 'aionui-config']}
        loadedMcpStatuses={[]}
      />
    );
    fireEvent.click(screen.getByTestId('aionrs-attach-folder-btn'));

    expect(await screen.findByText('Selected skills · 1')).toBeInTheDocument();
    expect(screen.queryByText('aionui-config')).not.toBeInTheDocument();
  });

  it('preserves the AionUi Skill snapshot when catalog loading fails', async () => {
    projectedSkills.current = undefined;
    preserveLoadedSkillNames.current = true;
    catalogError.current = new Error('catalog unavailable');

    render(
      <FileAttachButton
        openFileSelector={vi.fn()}
        loadedSkills={['officecli-docx', 'aionui-config']}
        loadedMcpStatuses={[]}
      />
    );
    fireEvent.click(screen.getByTestId('aionrs-attach-folder-btn'));

    expect(await screen.findByText('Selected skills · 2')).toBeInTheDocument();
  });

  it('does not expose Ki-Buddy Skill names when catalog loading fails', async () => {
    projectedSkills.current = undefined;
    preserveLoadedSkillNames.current = false;
    catalogError.current = new Error('catalog unavailable');

    render(
      <FileAttachButton
        openFileSelector={vi.fn()}
        loadedSkills={['officecli-docx', 'aionui-config']}
        loadedMcpStatuses={[]}
      />
    );
    fireEvent.click(screen.getByTestId('aionrs-attach-folder-btn'));

    expect(await screen.findByText('Upload from device')).toBeInTheDocument();
    expect(screen.queryByText(/Selected skills/)).not.toBeInTheDocument();
  });
});
