import { createBackendMigrationScheduler } from '@/process/startup/backendMigrationScheduler';
import { describe, expect, it, vi } from 'vitest';

function deferred(): {
  promise: Promise<void>;
  reject: (error: unknown) => void;
  resolve: () => void;
} {
  let reject!: (error: unknown) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('backend migration scheduler', () => {
  it('waits for backend readiness before starting migrations', async () => {
    let ready = false;
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = createBackendMigrationScheduler({ isReady: () => ready, onError: vi.fn(), run });

    scheduler.trigger();
    expect(run).not.toHaveBeenCalled();
    ready = true;
    scheduler.trigger();

    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
  });

  it('retries after a failed run when authentication triggers it later', async () => {
    const firstRun = deferred();
    const onError = vi.fn();
    const run = vi.fn().mockReturnValueOnce(firstRun.promise).mockResolvedValueOnce(undefined);
    const scheduler = createBackendMigrationScheduler({ isReady: () => true, onError, run });

    scheduler.trigger();
    firstRun.reject(new Error('unauthorized'));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    scheduler.trigger();

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it('queues one retry when authentication arrives during a failing run', async () => {
    const firstRun = deferred();
    const run = vi.fn().mockReturnValueOnce(firstRun.promise).mockResolvedValueOnce(undefined);
    const scheduler = createBackendMigrationScheduler({ isReady: () => true, onError: vi.fn(), run });

    scheduler.trigger();
    scheduler.trigger();
    expect(run).toHaveBeenCalledOnce();
    firstRun.reject(new Error('unauthorized'));

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it('ignores later triggers after a successful run', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = createBackendMigrationScheduler({ isReady: () => true, onError: vi.fn(), run });

    scheduler.trigger();
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    scheduler.trigger();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(run).toHaveBeenCalledOnce();
  });
});
