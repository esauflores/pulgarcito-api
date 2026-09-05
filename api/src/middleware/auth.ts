// External
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

// App
import type { Bindings } from "@/env";

// Infrastructure
import { auth } from "@/infrastructure/auth";

export const requireApiKey: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const key = c.req.header("x-api-key");

  if (!key) throw new HTTPException(401, { message: "Missing API Key" });

  const result = await auth(c.env).api.verifyApiKey({ body: { key } });

  if (!result.valid || !result.key?.referenceId) throw new HTTPException(401, { message: "Invalid API Key" });

  await next();
};
