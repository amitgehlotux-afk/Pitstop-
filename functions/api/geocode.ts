import type { Env } from '../_lib/env';
import { body, fail, json, UA } from '../_lib/http';
import { cacheGet, cachePut, rateLimit } from '../_lib/store';

// POST {q} → {lat,lng,label}   (OpenRouteService / Pelias geocoding, India first)
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await rateLimit(env, request, 'geocode'))) return fail(429, 'Too many requests. Try again in a minute.');
  const b = await body<{ q?: string }>(request);
  const q = b?.q?.trim();
  if (!q || q.length > 200) return fail(400, 'Enter a place name.');
  if (!env.ORS_API_KEY) return fail(503, 'Geocoding is not configured.');

  const key = `geo:${q.toLowerCase()}`;
  const hit = await cacheGet<{ lat: number; lng: number; label: string }>(env, key);
  if (hit) return json(hit);

  const url = new URL('https://api.openrouteservice.org/geocode/search');
  url.searchParams.set('text', q);
  url.searchParams.set('size', '1');
  url.searchParams.set('boundary.country', 'IN');
  const res = await fetch(url, { headers: { Authorization: env.ORS_API_KEY, 'User-Agent': UA, Accept: 'application/json' } });
  if (res.status === 429) return fail(429, 'Geocoder is busy. Try again shortly.');
  if (!res.ok) return fail(502, 'Could not look up that place.');
  const data = (await res.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: { label?: string; name?: string } }[] };
  const f = data.features?.[0];
  if (!f) return fail(404, `No match for "${q}" in India.`);
  const out = { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: f.properties.label || f.properties.name || q };
  await cachePut(env, key, out, 7 * 24 * 3600);
  return json(out);
};
