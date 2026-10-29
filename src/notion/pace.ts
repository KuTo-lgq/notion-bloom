/**
 * Spaces Notion requests out.
 *
 * The public API allows about three requests per second averaged over the
 * integration. The SDK already retries 429s; this keeps a steady client from
 * generating them in the first place, which matters once a page runs to a few
 * hundred blocks.
 */

export function createPacer(minIntervalMs = 340) {
  let tail: Promise<void> = Promise.resolve();

  return async function paced<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(async () => {
      const started = Date.now();
      try {
        return await fn();
      } finally {
        const wait = minIntervalMs - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
    });
    // A failure must not stall every later call.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
