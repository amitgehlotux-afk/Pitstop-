import type { Env } from '../_lib/env';
import { body, fail, json, sha, UA } from '../_lib/http';
import { cacheGet, cachePut, rateLimit } from '../_lib/store';
import { buildCorridorQuery, parseElements, type OsmElement, type RawStop } from '../../src/lib/overpass';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const TTL = 6 * 3600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST {corridor: [lng,lat][], kinds?} → RawStop[]   (Overpass; one query per box window)
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await rateLimit(env, request, 'stops'))) return fail(429, 'Too many requests. Try again in a minute.');
  const b = await body<{ corridor?: [number, number][]; kinds?: string[] }>(request);
  const corridor = b?.corridor;
  if (!Array.isArray(corridor) || corridor.length < 2 || corridor.length > 80) return fail(400, 'Corridor must have 2–80 points.');
  if (!corridor.every((p) => Array.isArray(p) && p.length >= 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)))) {
    return fail(400, 'Bad corridor.');
  }
  const rounded = corridor.map(([lng, lat]) => [Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4] as [number, number]);
  const key = `stops:${await sha(JSON.stringify(rounded))}`;
  const hit = await cacheGet<RawStop[]>(env, key);
  if (hit) return json({ stops: hit, cached: true });

  const query = buildCorridorQuery(rounded);
  let delay = 2000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.ok) {
      const data = (await res.json()) as { elements?: OsmElement[] };
      const stops = parseElements(data.elements ?? []);
      await cachePut(env, key, stops, TTL);
      return json({ stops });
    }
    if (res.status === 429 || res.status === 504) {
      const ra = parseInt(res.headers.get('retry-after') ?? '', 10);
      await sleep(Number.isFinite(ra) ? Math.min(ra * 1000, 10_000) : delay);
      delay *= 2;
      continue;
    }
    return fail(502, 'OSM lookup failed.');
  }
  return fail(503, 'OSM servers are busy. Try this box again in a minute.', { retry: true });
};
