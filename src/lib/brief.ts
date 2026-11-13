// Deterministic 5-line briefing. Used by /api/brief as the facts sheet and as its fallback,
// and by the client when the API is unreachable.
import type { Trip } from '../types';

const NEED_WORD: Record<string, string> = { fuel: 'fuel', restroom: 'restroom', coffee: 'coffee', food: 'food', dogBreak: 'dog break' };

function t(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function briefFacts(trip: Pick<Trip, 'stints' | 'route' | 'car' | 'origin' | 'destination' | 'departAt'>): string[] {
  const s = trip.stints;
  if (!s.length) return ['No stints planned.'];
  const last = s[s.length - 1];
  const dist = Math.round(trip.route?.distanceKm ?? last.toKm);
  const boxes = s.filter((x) => x.box);
  const fuelBoxes = boxes.filter((x) => x.box!.need.includes('fuel'));
  const nightStints = s.filter((x) => x.flags.includes('night')).map((x) => x.n);
  const climbStints = s.filter((x) => x.flags.includes('climb')).map((x) => x.n);
  const first = boxes[0];

  const l1 = `${s.length} stints, ${dist} km, leave ${t(trip.departAt)}, arrive about ${t(last.endAt)}.`;
  const l2 = fuelBoxes.length
    ? `Fuel at box ${fuelBoxes.map((x) => x.n).join(', ')} (km ${fuelBoxes.map((x) => Math.round(x.box!.centerKm)).join(', ')}). Lowest tank ${Math.min(...s.map((x) => x.fuelLeftPct))}%.`
    : `No fuel stop needed. Tank ends near ${last.fuelLeftPct}% of a ${trip.car.rangeKm} km range.`;
  const l3 = nightStints.length ? `Night driving in stint ${nightStints.join(', ')}.` : 'All stints in daylight.';
  const l4 = climbStints.length ? `Ghat or climb sections in stint ${climbStints.join(', ')}. Take them slow.` : 'No big climbs on this route.';
  const l5 = first?.box
    ? `First box near km ${Math.round(first.box.centerKm)}, ${t(first.box.etaFrom)}–${t(first.box.etaTo)}: ${first.box.need.map((n) => NEED_WORD[n]).join(', ')}.`
    : 'No boxes. One stint to the finish.';
  return [l1, l2, l3, l4, l5];
}

/** enforce the house style on any briefing text: 5 short lines, no exclamation marks, no markdown */
export function cleanBrief(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•>]+|\d+[.)])\s+/, '').replace(/[*_`#]/g, '').replace(/!/g, '.').replace(/\.{2,}/g, '.').trim())
    .filter(Boolean)
    .slice(0, 5);
}
