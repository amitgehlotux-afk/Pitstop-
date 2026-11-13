// Small cache + counter layer. Uses KV when bound (exact, global), else the Cache API (per colo, best effort).
import type { Env } from './env';

const ORIGIN = 'https://pitstop-cache.internal';

export async function cacheGet<T>(env: Env, key: string): Promise<T | null> {
  if (env.PITSTOP_KV) return (await env.PITSTOP_KV.get(key, 'json')) as T | null;
  const hit = await caches.default.match(new Request(`${ORIGIN}/${encodeURIComponent(key)}`));
  return hit ? ((await hit.json()) as T) : null;
}

export async function cachePut(env: Env, key: string, value: unknown, ttlSec: number): Promise<void> {
  if (env.PITSTOP_KV) {
    await env.PITSTOP_KV.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSec) });
    return;
  }
  await caches.default.put(
    new Request(`${ORIGIN}/${encodeURIComponent(key)}`),
    new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttlSec}` },
    }),
  );
}

/** increments and returns the new count */
export async function bump(env: Env, key: string, ttlSec: number): Promise<number> {
  const cur = (await cacheGet<number>(env, key)) ?? 0;
  const next = cur + 1;
  await cachePut(env, key, next, ttlSec);
  return next;
}

export async function peek(env: Env, key: string): Promise<number> {
  return (await cacheGet<number>(env, key)) ?? 0;
}

/** Per-IP fixed-window limit. Returns true when the request may proceed. */
export async function rateLimit(env: Env, req: Request, bucket: string): Promise<boolean> {
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const limit = parseInt(env.RATE_LIMIT_PER_MIN ?? '30', 10) || 30;
  const minute = Math.floor(Date.now() / 60_000);
  const n = await bump(env, `rl:${bucket}:${ip}:${minute}`, 120);
  return n <= limit;
}

export function today(): string {
  // India-local day for the daily verification cap
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
