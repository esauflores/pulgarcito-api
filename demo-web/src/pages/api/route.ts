export const prerender = false;

import type { APIRoute } from "astro";

import { proxyApi } from "@/lib/api-proxy";

export const GET: APIRoute = ({ url }) => proxyApi("/api/v1/route", url.searchParams);
