/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import OpeningGuide from '@/renderer/pages/ki-buddy/Onboarding/OpeningGuide';

describe('Ki-Buddy opening guide', () => {
  beforeAll(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  });

  it('moves through every introduction step before finishing', () => {
    const finish = vi.fn();
    render(<OpeningGuide onFinish={finish} />);

    expect(screen.getByText('login.kiBuddy.onboarding.tools.claudeCode')).toBeInTheDocument();
    expect(screen.getByText('login.kiBuddy.onboarding.tools.codexCli')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'login.kiBuddy.onboarding.next' }));
    expect(screen.getByText('login.kiBuddy.onboarding.tools.aionCli')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'login.kiBuddy.onboarding.next' }));
    expect(screen.getByText('login.kiBuddy.onboarding.capabilities.instructions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'login.kiBuddy.onboarding.start' }));

    expect(finish).toHaveBeenCalledOnce();
  });

  it('supports accessible direct step navigation without finishing the guide', () => {
    const finish = vi.fn();
    render(<OpeningGuide onFinish={finish} />);

    const stepButtons = screen.getAllByRole('button', { name: 'login.kiBuddy.onboarding.stepLabel' });
    fireEvent.click(stepButtons[2]);
    expect(screen.getByText('login.kiBuddy.onboarding.capabilities.instructions')).toBeInTheDocument();
    expect(stepButtons[2]).toHaveAttribute('aria-current', 'step');
    expect(finish).not.toHaveBeenCalled();
  });

  it('allows the user to skip the guide', () => {
    const finish = vi.fn();
    render(<OpeningGuide onFinish={finish} />);

    fireEvent.click(screen.getByRole('button', { name: 'login.kiBuddy.onboarding.skip' }));

    expect(finish).toHaveBeenCalledOnce();
  });
});
