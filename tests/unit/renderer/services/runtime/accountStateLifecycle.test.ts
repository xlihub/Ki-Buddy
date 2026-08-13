import { describe, expect, it, vi } from 'vitest';
import {
  registerAccountStateResetter,
  resetAccountScopedRendererState,
} from '@/renderer/services/runtime/accountStateLifecycle';

describe('account-scoped renderer state lifecycle', () => {
  it('runs registered resetters and stops after they unregister', () => {
    const reset = vi.fn();
    const unregister = registerAccountStateResetter(reset);

    resetAccountScopedRendererState();
    expect(reset).toHaveBeenCalledOnce();

    unregister();
    resetAccountScopedRendererState();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('continues clearing account state when one registered resetter fails', () => {
    const failedReset = vi.fn(() => {
      throw new Error('reset failed');
    });
    const successfulReset = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unregisterFailed = registerAccountStateResetter(failedReset);
    const unregisterSuccessful = registerAccountStateResetter(successfulReset);

    expect(() => resetAccountScopedRendererState()).not.toThrow();
    expect(successfulReset).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), expect.any(Error));

    unregisterFailed();
    unregisterSuccessful();
    consoleError.mockRestore();
  });
});
