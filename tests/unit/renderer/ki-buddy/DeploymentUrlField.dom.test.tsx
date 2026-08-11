import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import DeploymentUrlField from '@/renderer/pages/ki-buddy/DeploymentUrlField';

const history = {
  lastSuccessful: 'https://agents-two.example.com',
  successfulUrls: ['https://agents-two.example.com', 'https://agents-one.example.com'],
};

const TestField: React.FC = () => {
  const [value, setValue] = useState(history.lastSuccessful);
  return (
    <DeploymentUrlField
      value={value}
      history={history}
      inputLabel='Deployment URL'
      clearLabel='Clear deployment URL'
      lastSuccessfulLabel='Last signed in'
      placeholder='https://agents.example.com'
      onChange={setValue}
    />
  );
};

describe('DeploymentUrlField', () => {
  it('clears a populated deployment URL from the trailing control', () => {
    render(<TestField />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear deployment URL' }));
    expect(screen.getByLabelText('Deployment URL')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear deployment URL' })).not.toBeInTheDocument();
  });

  it('shows every cached deployment and marks the last successful one', async () => {
    render(<TestField />);

    const input = screen.getByLabelText('Deployment URL');
    fireEvent.focus(input);
    expect(await screen.findByText('Last signed in')).toBeInTheDocument();
    fireEvent.click(screen.getByText('https://agents-one.example.com'));
    expect(input).toHaveValue('https://agents-one.example.com');
  });

  it('does not expose the clear action when the deployment field is disabled', () => {
    render(
      <DeploymentUrlField
        disabled
        value={history.lastSuccessful}
        history={history}
        inputLabel='Deployment URL'
        clearLabel='Clear deployment URL'
        lastSuccessfulLabel='Last signed in'
        placeholder='https://agents.example.com'
      />
    );

    expect(screen.getByLabelText('Deployment URL')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clear deployment URL' })).not.toBeInTheDocument();
  });
});
