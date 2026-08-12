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
});
