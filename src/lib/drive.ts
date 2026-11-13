import type { Stint, Stop, Trip } from '../types';

export const CALL_KM = 10;
export const CALL_MIN = 10;

/** where the plan says the car is at `at` (router km) */
export function planKmAt(trip: Trip, at: Date): number {
  const t = at.getTime();
  const s = trip.stints;
  if (!s.length) return 0;
  if (t <= new Date(s[0].startAt).getTime()) return 0;
  for (const x of s) {
    const a = new Date(x.startAt).getTime();
    const b = new Date(x.endAt).getTime();
    if (t < a) return x.fromKm; // in a pit stop before this stint
    if (t <= b) return x.fromKm + ((t - a) / Math.max(1, b - a)) * (x.toKm - x.fromKm);
  }
  return s[s.length - 1].toKm;
}

export interface DriveState {
  current: Stint | null;
  next: Stint | null;
  target: Stop | null;
  targetKm: number | null;
  kmToBox: number | null;
  minToBox: number | null;
  call: boolean;
  finished: boolean;
}

export function driveState(trip: Trip, currentKm: number, speedKmh: number): DriveState {
  const pitted = new Set(trip.log.map((l) => l.boxIndex));
  const total = trip.route?.distanceKm ?? trip.stints[trip.stints.length - 1]?.toKm ?? 0;
  const current = trip.stints.find((s) => currentKm >= s.fromKm - 0.01 && currentKm < s.toKm) ?? trip.stints[trip.stints.length - 1] ?? null;
  let next: Stint | null = null;
  let target: Stop | null = null;
  let targetKm: number | null = null;
  for (const s of trip.stints) {
    if (!s.box || pitted.has(s.n)) continue;
    const stop = s.box.candidates.find((c) => c.id === s.box!.locked) ?? null;
    const k = stop?.routeKm ?? s.box.centerKm;
    if (k < currentKm - 1) continue; // passed it without pitting
    next = s;
    target = stop;
    targetKm = k;
    break;
  }
  const kmToBox = targetKm === null ? null : Math.max(0, targetKm - currentKm);
  const minToBox = kmToBox === null ? null : (kmToBox / Math.max(5, speedKmh)) * 60;
  const call = kmToBox !== null && minToBox !== null && (kmToBox <= CALL_KM || minToBox <= CALL_MIN);
  return { current, next, target, targetKm, kmToBox, minToBox, call, finished: currentKm >= total - 0.5 };
}
