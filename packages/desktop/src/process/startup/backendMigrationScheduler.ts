type BackendMigrationSchedulerOptions = Readonly<{
  isReady: () => boolean;
  onError: (error: unknown) => void;
  run: () => Promise<void>;
}>;

export type BackendMigrationScheduler = Readonly<{
  trigger: () => void;
}>;

/** Creates a migration scheduler that coalesces triggers and remains retryable after failure. */
export function createBackendMigrationScheduler(options: BackendMigrationSchedulerOptions): BackendMigrationScheduler {
  let completed = false;
  let queued = false;
  let running = false;

  const trigger = (): void => {
    if (!options.isReady() || completed) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    queued = false;
    void options
      .run()
      .then(() => {
        completed = true;
      })
      .catch((error: unknown) => {
        options.onError(error);
      })
      .finally(() => {
        running = false;
        const shouldRetry = queued && !completed;
        queued = false;
        if (shouldRetry) trigger();
      });
  };

  return { trigger };
}
