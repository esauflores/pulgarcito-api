// Proxies browser requests to the pulgarcito API server-side, so the
// X-API-Key never reaches the client.
//
// Uses process.env (not import.meta.env) for both vars so they're read at
// request time, not baked in at build time — required on Cloudflare Workers
// (nodejs_compat exposes wrangler vars/secrets via process.env; import.meta.env
// would freeze the secret into the built bundle instead) and also lets
// INTERNAL_API_URL differ per environment without a rebuild (e.g.
// "http://api:3000" inside Docker Compose vs. "http://localhost:3000" for
// local dev), unlike PUBLIC_API_URL, which the browser uses directly and
// must be a stable, host-reachable URL known at build time.
export async function proxyApi(path: string, search: URLSearchParams): Promise<Response> {
  const baseUrl = process.env.INTERNAL_API_URL ?? import.meta.env.PUBLIC_API_URL;
  const target = new URL(path, baseUrl);
  target.search = search.toString();

  const res = await fetch(target, {
    headers: { "X-API-Key": process.env.PULGARCITO_API_KEY ?? "" },
  });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { "Content-Type": "application/json" } });
}
