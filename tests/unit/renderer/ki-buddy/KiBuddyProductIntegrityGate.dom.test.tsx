import { render, screen } from '@testing-library/react';
import React from 'react';
import { expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/components/layout/InstallationIntegrityDialog', () => ({
  InstallationIntegrityModalHost: ({ description }: { description: string }) => <div>{description}</div>,
}));

import KiBuddyProductIntegrityGate from '@/renderer/pages/ki-buddy/KiBuddyProductIntegrityGate';

it('shows an installation-integrity error instead of AionUi business content for an invalid Ki-Buddy policy', () => {
  render(<KiBuddyProductIntegrityGate failure='Product experience features has invalid fields: missing team' />);

  expect(screen.getByText('login.kiBuddy.productExperience.invalidPolicyDescription')).toBeInTheDocument();
  expect(screen.queryByText('AionUi business content')).not.toBeInTheDocument();
});
