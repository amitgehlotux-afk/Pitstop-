import type { Env } from '../_lib/env';
import { body, fail, json, UA, validLatLng } from '../_lib/http';
import { cacheGet, cachePut, rateLimit } from '../_lib/store';

interface P { lat: number; lng: number }

// POST {origin,destination} → {geometry,distanceKm,durationMin,elevation?}   (ORS driving-car)
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await rateLimit(env, request, 'route'))) return fail(429, 'Too many requests. Try again in a minute.');
  const b = await body<{ origin?: P; destination?: P }>(request);
  if (!validLatLng(b?.origin) || !validLatLng(b?.destination)) return fail(400, 'Origin and destination are required.');
  if (!env.ORS_API_KEY) return fail(503, 'Routing is not configured.');
  const { origin, destination } = b as { origin: P; destination: P };

  const key = `route:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}:${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
  const hit = await cacheGet(env, key);
  if (hit) return json(hit);

  const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: { Authorization: env.ORS_API_KEY, 'content-type': 'application/json', 'User-Agent': UA, Accept: 'application/geo+json, application/json' },
    body: JSON.stringify({
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
      elevation: true,
      instructions: false,
      units: 'km',
    }),
  });
  if (res.status === 429) return fail(429, 'Router is busy. Try again shortly.');
  if (!res.ok) return fail(502, 'No driving route found between those places.');
  const data = (await res.json()) as {
    features?: { geometry: { coordinates: number[][] }; properties: { summary?: { distance?: number; duration?: number }; ascent?: number; descent?: number } }[];
  };
  const f = data.features?.[0];
  if (!f) return fail(404, 'No driving route found.');
  const s = f.properties.summary ?? {};
  // units=km → distance in km; duration is always seconds
  const out = {
    geometry: f.geometry.coordinates.map((c) => c.map((v, i) => (i < 2 ? Math.round(v * 1e5) / 1e5 : Math.round(v)))),
    distanceKm: Math.round((s.distance ?? 0) * 10) / 10,
    durationMin: Math.round((s.duration ?? 0) / 60),
    elevation:
      f.properties.ascent !== undefined ? { ascentM: Math.round(f.properties.ascent), descentM: Math.round(f.properties.descent ?? 0) } : undefined,
  };
  await cachePut(env, key, out, 24 * 3600);
  return json(out);
};
