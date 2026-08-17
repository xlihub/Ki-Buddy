/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
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
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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

import ConversationSkillsIndicator from '@/renderer/pages/conversation/components/ConversationSkillsIndicator';

describe('ConversationSkillsIndicator product Skill catalog', () => {
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

  it('shows only product-visible loaded Skills', () => {
    projectedSkills.current = [{ name: 'officecli-docx', description: 'Word documents' }];

    render(
      <ConversationSkillsIndicator conversation={{ extra: { skills: ['officecli-docx', 'aionui-config'] } } as never} />
    );

    expect(screen.getByTestId('skills-indicator')).toHaveTextContent('1');
    expect(screen.queryByText('aionui-config')).not.toBeInTheDocument();
  });

  it('stays hidden for Ki-Buddy when catalog loading fails', () => {
    projectedSkills.current = undefined;
    preserveLoadedSkillNames.current = false;
    catalogError.current = new Error('catalog unavailable');

    render(
      <ConversationSkillsIndicator conversation={{ extra: { skills: ['officecli-docx', 'aionui-config'] } } as never} />
    );

    expect(screen.queryByTestId('skills-indicator')).not.toBeInTheDocument();
  });

  it('preserves the AionUi Skill snapshot when catalog loading fails', () => {
    projectedSkills.current = undefined;
    preserveLoadedSkillNames.current = true;
    catalogError.current = new Error('catalog unavailable');

    render(
      <ConversationSkillsIndicator conversation={{ extra: { skills: ['officecli-docx', 'aionui-config'] } } as never} />
    );

    expect(screen.getByTestId('skills-indicator')).toHaveTextContent('2');
  });
});
