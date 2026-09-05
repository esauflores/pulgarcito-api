import { env } from "cloudflare:workers";

// Proxies browser requests to the pulgarcito API server-side, so the
// X-API-Key never reaches the client.
//
// Routes through the "API" service binding (see wrangler.jsonc) rather than
// a plain fetch() to the api's public URL: two Workers on the same
// *.workers.dev zone can't fetch() each other directly — Cloudflare blocks
// it as a same-zone loop (error 1042). A service binding is also faster,
// since it skips the public network round-trip entirely.
export async function proxyApi(path: string, search: URLSearchParams): Promise<Response> {
  const target = new URL(path, "https://pulgarcito-api.internal");
  target.search = search.toString();

  const res = await env.API.fetch(target, {
    headers: { "X-API-Key": env.PULGARCITO_API_KEY },
  });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { "Content-Type": "application/json" } });
}
