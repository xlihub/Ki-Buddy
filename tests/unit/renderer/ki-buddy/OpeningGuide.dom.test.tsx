/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/renderer/pages/ki-buddy/onboarding/ToolSupportStep', () => ({ default: () => <div>tool-support</div> }));
vi.mock('@/renderer/pages/ki-buddy/onboarding/AssistantFlowStep', () => ({
  default: () => <div>assistant-flow</div>,
}));
vi.mock('@/renderer/pages/ki-buddy/onboarding/CapabilityStep', () => ({ default: () => <div>capability</div> }));

import OpeningGuide from '@/renderer/pages/ki-buddy/onboarding/OpeningGuide';

describe('Ki-Buddy opening guide', () => {
  it('moves through every introduction step before finishing', () => {
    const finish = vi.fn();
    render(<OpeningGuide onFinish={finish} />);

    expect(screen.getByText('tool-support')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'login.onboarding.next' }));
    expect(screen.getByText('assistant-flow')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'login.onboarding.next' }));
    expect(screen.getByText('capability')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'login.onboarding.start' }));

    expect(finish).toHaveBeenCalledOnce();
  });

  it('supports accessible direct step navigation without finishing the guide', () => {
    const finish = vi.fn();
    render(<OpeningGuide onFinish={finish} />);

    const stepButtons = screen.getAllByRole('button', { name: 'login.onboarding.stepLabel' });
    fireEvent.click(stepButtons[2]);
    expect(screen.getByText('capability')).toBeInTheDocument();
    expect(stepButtons[2]).toHaveAttribute('aria-current', 'step');
    expect(finish).not.toHaveBeenCalled();
  });

  it('allows the user to skip the guide', () => {
    const finish = vi.fn();
    render(<OpeningGuide onFinish={finish} />);

    fireEvent.click(screen.getByRole('button', { name: 'login.onboarding.skip' }));

    expect(finish).toHaveBeenCalledOnce();
  });
});
