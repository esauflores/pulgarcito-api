// External
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// App
import type { Bindings } from "@/env";
import { testBindings } from "@/env";

// Middleware
import { requireApiKey } from "./auth";

// Test Utilities
import { makeKey, makeUserWithKey } from "@/helpers/test/better-auth";
import { resetDatabase } from "@/helpers/test/pglite";

// Helper Functions
const makeContext = (apiKeyHeader: string | undefined) =>
  ({
    req: {
      header: (name: string) => (name.toLowerCase() === "x-api-key" ? apiKeyHeader : undefined),
    },
    env: testBindings,
  }) as unknown as Context<{ Bindings: Bindings }>;

const makeNext = () => vi.fn().mockResolvedValue(undefined);

describe("requireApiKey", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("401 Missing API Key when X-API-Key header is absent", async () => {
    const c = makeContext(undefined);
    const next = makeNext();
    await expect(requireApiKey(c, next)).rejects.toMatchObject({
      status: 401,
      message: "Missing API Key",
    });
  });

  it("401 Invalid API Key when the key is not in the apikey table", async () => {
    const c = makeContext("pk_garbage");
    const next = makeNext();
    await expect(requireApiKey(c, next)).rejects.toMatchObject({
      status: 401,
      message: "Invalid API Key",
    });
  });

  it("401 Invalid API Key when the apikey has empty referenceId (schema drift guard)", async () => {
    const key = await makeKey("");
    const c = makeContext(key);
    const next = makeNext();
    await expect(requireApiKey(c, next)).rejects.toMatchObject({
      status: 401,
      message: "Invalid API Key",
    });
  });

  it("calls next() when the API key is valid", async () => {
    const key = await makeUserWithKey("user-ok");
    const c = makeContext(key);
    const next = makeNext();
    await requireApiKey(c, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows repeated requests with the same valid API key", async () => {
    const key = await makeUserWithKey("user-repeat");
    const c = makeContext(key);
    const next = makeNext();
    await requireApiKey(c, next);
    await requireApiKey(c, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
