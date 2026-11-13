import SunCalc from 'suncalc';
import type { Phase } from '../types';

export const BENGALURU = { lat: 12.9716, lng: 77.5946 };
export const PHASES: Phase[] = ['morning', 'afternoon', 'evening', 'night'];

type SunTimesFn = (d: Date, lat: number, lng: number) => { dawn: Date; dusk: Date; goldenHour: Date };
let sunTimes: SunTimesFn = (d, lat, lng) => SunCalc.getTimes(d, lat, lng);
/** test hook */
export function setSunTimes(fn: SunTimesFn) {
  sunTimes = fn;
}

/** 11:00 local time at the given longitude-ish timezone; we use the device's local clock (IST in India). */
function elevenOn(day: Date): Date {
  const d = new Date(day);
  d.setHours(11, 0, 0, 0);
  return d;
}

/**
 * night     = dusk → next dawn
 * morning   = dawn → 11:00
 * afternoon = 11:00 → goldenHour
 * evening   = goldenHour → dusk
 *
 * SunCalc.getTimes is keyed on the date of the passed instant, so we ask about "around noon" of
 * the local day to avoid date-boundary surprises.
 */
export function phaseAt(at: Date, lat: number, lng: number): Phase {
  const noon = new Date(at);
  noon.setHours(12, 0, 0, 0);
  const t = sunTimes(noon, lat, lng);
  const ms = at.getTime();
  const valid = (d: Date) => d instanceof Date && !Number.isNaN(d.getTime());
  // Polar edge cases do not occur in India, but keep a sane fallback.
  if (!valid(t.dawn) || !valid(t.dusk) || !valid(t.goldenHour)) {
    const h = at.getHours();
    return h < 6 || h >= 19 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  }
  if (ms < t.dawn.getTime() || ms >= t.dusk.getTime()) return 'night';
  const eleven = elevenOn(at).getTime();
  const golden = t.goldenHour.getTime();
  if (ms < Math.min(eleven, golden)) return 'morning';
  if (ms < golden) return 'afternoon';
  return 'evening';
}

/** Next time (after `from`) the phase changes, used by callers that want to schedule work. */
export function sunTimesFor(at: Date, lat: number, lng: number) {
  const noon = new Date(at);
  noon.setHours(12, 0, 0, 0);
  return sunTimes(noon, lat, lng);
}

export const PHASE_LABEL: Record<Phase, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};
