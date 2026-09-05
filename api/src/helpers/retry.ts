export interface RetryOptions {
  retries?: number;
  initialDelayMs?: number;
}

// Retries `fn` with exponential backoff, logging each failed attempt before
// waiting. Throws the last error once `retries` is exhausted.
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 4, initialDelayMs = 5000 } = options;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.error(`  attempt ${attempt}/${retries} failed: ${err}; retrying in ${delay / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  // Unreachable — the loop above always returns or throws.
  throw new Error("withRetry: exhausted retries without a result");
}
