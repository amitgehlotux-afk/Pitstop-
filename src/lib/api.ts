import type { Place, Route, Stop, Trip, Verification } from '../types';
import type { RawStop } from './overpass';

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

async function post<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('No connection. Check your network and try again.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? `Request failed (${res.status})`), res.status, data);
  return data as T;
}

export const geocode = (q: string) => post<Place>('/api/geocode', { q });
export const route = (origin: Place, destination: Place) => post<Route>('/api/route', { origin, destination });
export const stops = (corridor: [number, number][]) => post<{ stops: RawStop[] }>('/api/stops', { corridor }).then((r) => r.stops);
export const verify = (stop: Stop, etaLocal: string, dog: boolean) =>
  post<Verification>('/api/verify', {
    stop: { id: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng, kinds: stop.kinds, osmTags: stop.osmTags },
    etaLocal,
    dog,
  });
export const brief = (trip: Trip) =>
  post<{ text: string; source?: string }>('/api/brief', {
    trip: { ...trip, route: trip.route ? { distanceKm: trip.route.distanceKm, durationMin: trip.route.durationMin } : undefined },
  });
