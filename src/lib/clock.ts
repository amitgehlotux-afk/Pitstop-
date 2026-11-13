// Debug overrides: ?now=ISO&lat=&lng=
// `now` keeps ticking from the override so timers and Drive mode still move.
const loadedAt = Date.now();

function params(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  // support both ?now= and #/route?now=
  const s = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  const qi = hash.indexOf('?');
  if (qi >= 0) new URLSearchParams(hash.slice(qi + 1)).forEach((v, k) => s.set(k, v));
  return s;
}

let overrideNow: number | null = null;
let overrideLoc: { lat: number; lng: number } | null = null;

export function readDebug() {
  const p = params();
  const n = p.get('now');
  if (n) {
    const t = Date.parse(n);
    overrideNow = Number.isNaN(t) ? null : t;
  }
  const lat = parseFloat(p.get('lat') ?? '');
  const lng = parseFloat(p.get('lng') ?? '');
  overrideLoc = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
readDebug();

export function now(): Date {
  if (overrideNow !== null) return new Date(overrideNow + (Date.now() - loadedAt));
  return new Date();
}

export function debugLocation(): { lat: number; lng: number } | null {
  return overrideLoc;
}

export function isDebug(): boolean {
  return overrideNow !== null || overrideLoc !== null;
}
