// Base HTTP client. Handles:
//   - Prepending the API base URL
//   - Attaching the bearer token (from token.ts)
//   - Parsing JSON
//   - Surfacing server error messages as ApiError
//
// Callers should use request/requestJson/requestNoBody directly; the
// entity-specific modules (paintings.ts etc.) wrap these for ergonomics.

import { config } from "./config";
import { getToken } from "./token";

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOpts["query"]): string {
  const base = config.apiUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${suffix}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function raw(path: string, opts: RequestOpts): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };
  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let details: unknown;
    try {
      const payload = (await res.json()) as { error?: string; details?: unknown };
      if (payload?.error) message = payload.error;
      details = payload?.details;
    } catch {
      // fall through — text body or empty
    }
    throw new ApiError(res.status, message, details);
  }
  return res;
}

export async function requestJson<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const res = await raw(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function requestNoBody(path: string, opts: RequestOpts = {}): Promise<void> {
  await raw(path, opts);
}
