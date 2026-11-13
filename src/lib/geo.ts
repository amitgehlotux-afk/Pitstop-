// Small geodesy helpers. Distances in km.
const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: [number, number], b: [number, number]): number {
  // points are [lng, lat]
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** cumulative km at each vertex */
export function cumulativeKm(line: number[][]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) {
    out.push(out[i - 1] + haversineKm(line[i - 1] as [number, number], line[i] as [number, number]));
  }
  return out;
}

export interface Measured {
  line: number[][];
  cum: number[];
  /** geometric length; may differ slightly from the router's distance */
  lengthKm: number;
  /** router distance / geometric length, used to convert between the two */
  scale: number;
}

export function measure(line: number[][], routerKm?: number): Measured {
  const cum = cumulativeKm(line);
  const lengthKm = cum[cum.length - 1] || 0;
  const scale = routerKm && lengthKm > 0 ? routerKm / lengthKm : 1;
  return { line, cum, lengthKm, scale };
}

/** point at a router-km distance along the line → [lng, lat] */
export function pointAtKm(m: Measured, km: number): [number, number] {
  const g = Math.max(0, Math.min(m.lengthKm, km / m.scale));
  let lo = 0;
  let hi = m.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (m.cum[mid] < g) lo = mid;
    else hi = mid;
  }
  const seg = m.cum[hi] - m.cum[lo] || 1;
  const t = (g - m.cum[lo]) / seg;
  const a = m.line[lo];
  const b = m.line[hi] ?? a;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** vertices between two router-km marks, inclusive of interpolated ends */
export function sliceKm(m: Measured, fromKm: number, toKm: number): number[][] {
  const gFrom = fromKm / m.scale;
  const gTo = toKm / m.scale;
  const out: number[][] = [pointAtKm(m, fromKm)];
  for (let i = 0; i < m.line.length; i++) {
    if (m.cum[i] > gFrom && m.cum[i] < gTo) out.push(m.line[i]);
  }
  out.push(pointAtKm(m, toKm));
  return out;
}

/** Thin a polyline so consecutive points are at least `stepKm` apart (keeps ends). */
export function thin(line: number[][], stepKm: number): number[][] {
  if (line.length <= 2) return line.map((p) => [p[0], p[1]]);
  const out: number[][] = [[line[0][0], line[0][1]]];
  let last = line[0];
  for (let i = 1; i < line.length - 1; i++) {
    if (haversineKm(last as [number, number], line[i] as [number, number]) >= stepKm) {
      out.push([line[i][0], line[i][1]]);
      last = line[i];
    }
  }
  const end = line[line.length - 1];
  out.push([end[0], end[1]]);
  return out;
}

/** Project a point onto the line. Returns router-km along and offset distance in km. */
export function project(m: Measured, p: [number, number]): { km: number; offKm: number } {
  let best = { km: 0, offKm: Infinity };
  const cosLat = Math.cos(rad(p[1]));
  for (let i = 1; i < m.line.length; i++) {
    const a = m.line[i - 1];
    const b = m.line[i];
    // local equirectangular projection, good enough at segment scale
    const ax = a[0] * cosLat, ay = a[1];
    const bx = b[0] * cosLat, by = b[1];
    const px = p[0] * cosLat, py = p[1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const q: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const off = haversineKm(p, q);
    if (off < best.offKm) {
      best = { km: (m.cum[i - 1] + (m.cum[i] - m.cum[i - 1]) * t) * m.scale, offKm: off };
    }
  }
  return best;
}

/** elevation gain and loss (m) between two router-km marks, if the line carries elevation */
export function elevationBetween(m: Measured, fromKm: number, toKm: number): { up: number; down: number } | null {
  if (!m.line.length || m.line[0].length < 3) return null;
  const gFrom = fromKm / m.scale;
  const gTo = toKm / m.scale;
  let up = 0;
  let down = 0;
  let prev: number | null = null;
  for (let i = 0; i < m.line.length; i++) {
    if (m.cum[i] < gFrom || m.cum[i] > gTo) continue;
    const e = m.line[i][2];
    if (prev !== null) {
      const d = e - prev;
      if (d > 0) up += d;
      else down -= d;
    }
    prev = e;
  }
  return { up, down };
}
