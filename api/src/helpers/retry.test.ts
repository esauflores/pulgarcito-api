import { describe, expect, it, vi } from "vitest";

import { withRetry } from "./retry";

describe("withRetry", () => {
  it("returns the result on the first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { initialDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries after a failure and returns once it succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValue("ok");
    await expect(withRetry(fn, { initialDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws the last error once retries are exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));
    await expect(withRetry(fn, { retries: 3, initialDelayMs: 1 })).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
