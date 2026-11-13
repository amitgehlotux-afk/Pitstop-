import type { BoxWindow, Need, Phase, Route, Stint, StintFlag } from '../types';
import { measure, pointAtKm, type Measured } from './geo';
import { phaseAt as defaultPhaseAt, sunTimesFor } from './phase';
import { hhmm } from './format';

export interface PlanInput {
  route: Route;
  departAt: Date;
  stintMin: number;
  car: { rangeKm: number; fuelPct: number };
  crew: { dog: boolean; kids: boolean };
  priorities: string[];
  night: 'avoid' | 'ok';
  phaseAt?: (at: Date, lat: number, lng: number) => Phase;
}

export interface PlanResult {
  stints: Stint[];
  advice: string[];
  speedKmh: number;
}

/** Box before 80% of range is used: never plan to run below 20% of a full tank. */
export const RESERVE_FRACTION = 0.2;
const KIDS_STINT_CAP_MIN = 90;
const CLIMB_WINDOW_KM = 15;
const CLIMB_DELTA_M = 300;

const MEALS: [number, number][] = [
  [7 * 60 + 30, 9 * 60 + 30],
  [12 * 60 + 30, 14 * 60 + 30],
  [19 * 60 + 30, 21 * 60 + 30],
];

function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

export function isMealTime(d: Date, widenMin = 0): boolean {
  const m = minutesOfDay(d);
  return MEALS.some(([a, b]) => m >= a - widenMin && m <= b + widenMin);
}

const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);

/** max elevation swing inside any CLIMB_WINDOW_KM window of the stint (ghat sections) */
export function maxSwingM(m: Measured, fromKm: number, toKm: number): number {
  if (!m.line.length || m.line[0].length < 3) return 0;
  // sample every 1 km using nearest vertex elevation
  const samples: number[] = [];
  let vi = 0;
  for (let k = fromKm; k <= toKm; k += 1) {
    const g = k / m.scale;
    while (vi < m.cum.length - 1 && m.cum[vi + 1] < g) vi++;
    const a = m.line[vi];
    const b = m.line[Math.min(vi + 1, m.line.length - 1)];
    const seg = m.cum[Math.min(vi + 1, m.cum.length - 1)] - m.cum[vi] || 1;
    const t = Math.max(0, Math.min(1, (g - m.cum[vi]) / seg));
    samples.push((a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t);
  }
  let best = 0;
  for (let i = 0; i < samples.length; i++) {
    let lo = samples[i];
    let hi = samples[i];
    for (let j = i + 1; j < Math.min(samples.length, i + CLIMB_WINDOW_KM + 1); j++) {
      lo = Math.min(lo, samples[j]);
      hi = Math.max(hi, samples[j]);
    }
    best = Math.max(best, hi - lo);
  }
  return best;
}

export function planStints(input: PlanInput): PlanResult {
  const phaseAt = input.phaseAt ?? defaultPhaseAt;
  const { route, car, crew, priorities } = input;
  const total = route.distanceKm;
  const speedKmPerMin = total / Math.max(1, route.durationMin);
  const stintMin = crew.kids ? Math.min(input.stintMin, KIDS_STINT_CAP_MIN) : input.stintMin;
  const stintKm = Math.max(10, stintMin * speedKmPerMin);
  const range = Math.max(50, car.rangeKm);
  const reserveKm = range * RESERVE_FRACTION;
  const m = measure(route.geometry, total);

  const stints: Stint[] = [];
  let pos = 0;
  let t = new Date(input.departAt);
  let fuelKm = (range * Math.max(0, Math.min(100, car.fuelPct))) / 100;
  let n = 1;
  let elapsedDriveMin = 0;

  const phaseAtKm = (when: Date, kmAlong: number) => {
    const [lng, lat] = pointAtKm(m, kmAlong);
    return phaseAt(when, lat, lng);
  };

  while (pos < total - 0.5 && n < 200) {
    const fuelLimit = pos + (fuelKm - reserveKm);
    let end = Math.min(pos + stintKm, total);
    let fuelForced = false;
    if (fuelLimit < end) {
      // Low tank at the start of this stint: box for fuel as soon as is sensible.
      end = Math.max(Math.min(fuelLimit, total), Math.min(pos + 10, total));
      fuelForced = true;
    }
    // Do not leave a stub: fold a short final stretch into this stint if fuel allows.
    const left = total - end;
    if (!fuelForced && left > 0 && left < stintKm * 0.25 && fuelKm - (total - pos) >= reserveKm) {
      end = total;
    }
    if (end <= pos) end = Math.min(total, pos + 1);

    const driveMin = (end - pos) / speedKmPerMin;
    const startAt = t;
    const endAt = addMin(t, driveMin);
    elapsedDriveMin += driveMin;
    const fuelAtEnd = fuelKm - (end - pos);
    const midAt = addMin(startAt, driveMin / 2);
    const phase = phaseAtKm(midAt, (pos + end) / 2);

    const flags: StintFlag[] = [];
    const nightSeen = [
      phaseAtKm(startAt, pos),
      phase,
      phaseAtKm(endAt, end),
    ].includes('night');
    if (nightSeen) flags.push('night');
    const fuelLeftPct = Math.max(0, (fuelAtEnd / range) * 100);
    if (fuelForced || fuelLeftPct < 30) flags.push('fuelCritical');
    if (maxSwingM(m, pos, end) >= CLIMB_DELTA_M) flags.push('climb');

    const stint: Stint = {
      n,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      fromKm: pos,
      toKm: end,
      phase,
      flags,
      fuelLeftPct: Math.round(fuelLeftPct),
    };

    if (end < total - 0.5) {
      const nextLeg = Math.min(stintKm, total - end);
      const need: Need[] = [];
      const needFuel = fuelForced || fuelAtEnd - reserveKm < nextLeg;
      if (needFuel) need.push('fuel');
      need.push('restroom');
      if (priorities.includes('coffee')) need.push('coffee');
      if (isMealTime(endAt, priorities.includes('food') ? 30 : 0)) need.push('food');
      if (crew.dog) need.push('dogBreak');

      let dwell = 10;
      if (needFuel) dwell += 8;
      if (need.includes('food')) dwell += 25;
      else if (need.includes('coffee')) dwell += 10;
      if (crew.dog) dwell += 10;

      const spread = Math.min(30, Math.max(5, Math.round(elapsedDriveMin * 0.08)));
      const box: BoxWindow = {
        centerKm: end,
        etaFrom: addMin(endAt, -spread).toISOString(),
        etaTo: addMin(endAt, spread).toISOString(),
        need,
        candidates: [],
        dwellMin: dwell,
        status: 'idle',
      };
      stint.box = box;
      fuelKm = needFuel ? range : fuelAtEnd;
      t = addMin(endAt, dwell);
    } else {
      fuelKm = fuelAtEnd;
      t = endAt;
    }
    stints.push(stint);
    pos = end;
    n++;
  }

  const advice = input.night === 'avoid' ? nightAdvice(stints, input, m, phaseAt) : [];
  return { stints, advice, speedKmh: speedKmPerMin * 60 };
}

function nightAdvice(
  stints: Stint[],
  input: PlanInput,
  m: Measured,
  phaseAt: (at: Date, lat: number, lng: number) => Phase,
): string[] {
  const nightStints = stints.filter((s) => s.flags.includes('night'));
  if (!nightStints.length) return [];
  const out: string[] = [];
  const depart = new Date(input.departAt);
  const last = stints[stints.length - 1];
  const tripMin = (new Date(last.endAt).getTime() - depart.getTime()) / 60_000;
  const [oLng, oLat] = pointAtKm(m, 0);
  const [dLng, dLat] = pointAtKm(m, input.route.distanceKm);

  // Only the finish runs past dusk, and not by much: trimming stop time fixes it.
  const { dusk: destDusk } = sunTimesFor(new Date(last.endAt), dLat, dLng);
  const lateMin = Math.round((new Date(last.endAt).getTime() - destDusk.getTime()) / 60_000);
  const totalDwell = stints.reduce((a, s) => a + (s.box?.dwellMin ?? 0), 0);
  if (nightStints.length === 1 && nightStints[0] === last && lateMin > 0 && lateMin <= Math.min(60, totalDwell / 2)) {
    out.push(`The last ${lateMin} min are after dusk. Cut stops by ${lateMin} min in total to arrive in daylight.`);
  }

  // Candidate: leave at dawn (or a little after) on the departure day, or the next day.
  for (const dayOffset of [0, 1]) {
    const day = addMin(depart, dayOffset * 24 * 60);
    const { dawn } = sunTimesFor(day, oLat, oLng);
    const leave = addMin(dawn, 10);
    const arrive = addMin(leave, tripMin);
    const { dusk } = sunTimesFor(arrive, dLat, dLng);
    const ok = arrive.getTime() <= dusk.getTime() && phaseAt(leave, oLat, oLng) !== 'night';
    if (ok && Math.abs(leave.getTime() - depart.getTime()) > 10 * 60_000) {
      out.push(
        `Leave at ${hhmm(leave)}${dayOffset ? ' the next day' : ''} to drive in daylight the whole way.`,
      );
      break;
    }
  }

  // Overnight: the box that ends the last daylight stint before an evening night stint.
  for (let i = 1; i < stints.length; i++) {
    const prev = stints[i - 1];
    if (stints[i].flags.includes('night') && !prev.flags.includes('night') && prev.box) {
      out.push(`Or stop overnight at box ${prev.n}, around km ${Math.round(prev.box.centerKm)}, before dark.`);
      break;
    }
  }
  if (!out.length) out.push(`Stints ${nightStints.map((s) => s.n).join(', ')} run in the dark. Consider a different departure.`);
  return out;
}
