export const prerender = false;

import type { APIRoute } from "astro";

import { proxyApi } from "@/lib/api-proxy";

export const GET: APIRoute = ({ url }) => {
  const path = url.searchParams.get("q") ? "/api/v1/places/search" : "/api/v1/places";
  return proxyApi(path, url.searchParams);
};
