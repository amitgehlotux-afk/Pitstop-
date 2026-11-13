// Run with TZ=Asia/Kolkata (set in vitest.config.ts).
import { describe, expect, it } from 'vitest';
import { planStints } from '../../src/lib/stints';
import { phaseAt, sunTimesFor } from '../../src/lib/phase';
import { rank } from '../../src/lib/score';
import { measure, pointAtKm } from '../../src/lib/geo';
import { driveState } from '../../src/lib/drive';
import { briefFacts, cleanBrief } from '../../src/lib/brief';
import { buildCorridorQuery, parseElements, type OsmElement } from '../../src/lib/overpass';
import type { Trip } from '../../src/types';
import { bengaluruGoa } from './fixtures';

const route = bengaluruGoa();
const base = {
  route,
  stintMin: 120,
  car: { rangeKm: 600, fuelPct: 100 },
  crew: { dog: true, kids: false },
  priorities: ['coffee', 'restrooms'],
  night: 'avoid' as const,
};
const B: [number, number] = [12.9716, 77.5946];

describe('stints', () => {
  const r = planStints({ ...base, departAt: new Date('2026-11-14T06:00:00+05:30') });

  it('Bengaluru → Goa at 06:00 gives at least 3 stints', () => {
    expect(r.stints.length).toBeGreaterThanOrEqual(3);
  });
  it('keeps fuel within range (box before 80% used)', () => {
    expect(r.stints.every((s) => s.fuelLeftPct >= 20)).toBe(true);
    expect(r.stints.some((s) => s.box?.need.includes('fuel'))).toBe(true);
  });
  it('flags the ghat as a climb', () => {
    expect(r.stints.some((s) => s.flags.includes('climb'))).toBe(true);
  });
  it('flags night stints and advises when night=avoid', () => {
    const late = planStints({ ...base, departAt: new Date('2026-11-14T13:00:00+05:30') });
    expect(late.stints.some((s) => s.flags.includes('night'))).toBe(true);
    expect(late.advice.length).toBeGreaterThan(0);
  });
  it('boxes early for fuel on a low tank', () => {
    const low = planStints({ ...base, car: { rangeKm: 600, fuelPct: 30 }, departAt: new Date('2026-11-14T06:00:00+05:30') });
    expect(low.stints[0].box?.need).toContain('fuel');
    expect(low.stints[0].toKm).toBeLessThanOrEqual(60.5);
  });
  it('caps stints at 90 min with kids', () => {
    const k = planStints({ ...base, crew: { dog: false, kids: true }, departAt: new Date('2026-11-14T06:00:00+05:30') });
    expect(k.stints.every((s) => (+new Date(s.endAt) - +new Date(s.startAt)) / 60000 <= 90.5)).toBe(true);
  });
  it('tints each stint by the phase at its own midpoint', () => {
    const late = planStints({ ...base, departAt: new Date('2026-11-14T13:00:00+05:30') });
    expect(late.stints[0].phase).toBe('afternoon');
    expect(late.stints[late.stints.length - 1].phase).toBe('night');
  });
});

describe('phases (Bengaluru, 14 Nov 2026)', () => {
  const at = (s: string) => phaseAt(new Date(s), ...B);
  it('05:30 night, 11:30 afternoon, golden hour evening, 20:00 night', () => {
    expect(at('2026-11-14T05:30:00+05:30')).toBe('night');
    expect(at('2026-11-14T08:00:00+05:30')).toBe('morning');
    expect(at('2026-11-14T11:30:00+05:30')).toBe('afternoon');
    const g = sunTimesFor(new Date('2026-11-14T12:00:00+05:30'), ...B).goldenHour;
    expect(phaseAt(new Date(g.getTime() + 60_000), ...B)).toBe('evening');
    expect(at('2026-11-14T20:00:00+05:30')).toBe('night');
  });
});

describe('score', () => {
  const r = planStints({ ...base, departAt: new Date('2026-11-14T06:00:00+05:30') });
  const m = measure(route.geometry, route.distanceKm);
  const box = r.stints.find((s) => s.box?.need.includes('fuel'))!.box!;
  const [lng, lat] = pointAtKm(m, box.centerKm);
  const els: OsmElement[] = [
    { type: 'node', id: 1, lat: lat + 0.001, lon: lng, tags: { amenity: 'fuel', name: 'Highway Fuels', toilets: 'yes' } },
    { type: 'node', id: 2, lat: lat + 0.0012, lon: lng + 0.001, tags: { amenity: 'cafe', name: 'Coffee Stop' } },
    { type: 'way', id: 3, center: { lat: lat + 0.0005, lon: lng - 0.001 }, tags: { leisure: 'park' } },
    { type: 'node', id: 4, lat: lat + 0.015, lon: lng, tags: { amenity: 'fuel', name: 'Far Fuel' } },
    { type: 'node', id: 5, lat: lat - 0.03, lon: lng - 0.01, tags: { amenity: 'fuel', name: 'Other Fuel' } },
    { type: 'node', id: 6, lat, lon: lng + 0.002, tags: { amenity: 'restaurant', name: 'Dhaba' } },
  ];
  const ranked = rank(parseElements(els), { need: box.need, centerKm: box.centerKm, priorities: ['coffee'], dog: true, route: m });
  it('returns 1–3 candidates, fuel required, cluster wins', () => {
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked.length).toBeLessThanOrEqual(3);
    expect(ranked.every((s) => s.kinds.includes('fuel'))).toBe(true);
    expect(ranked[0].name).toBe('Highway Fuels');
  });
  it('builds a 2 km corridor query', () => {
    expect(buildCorridorQuery([[77.5, 12.9], [77.6, 13.0]])).toContain('around:2000,12.90000,77.50000,13.00000,77.60000');
  });
});

describe('drive', () => {
  const r = planStints({ ...base, departAt: new Date('2026-11-14T06:00:00+05:30') });
  const trip = { ...base, id: 't', origin: { lat: B[0], lng: B[1], label: 'Bengaluru' }, destination: { lat: 15.49, lng: 73.83, label: 'Goa' }, departAt: r.stints[0].startAt, stints: r.stints, log: [] } as Trip;
  const c = r.stints[0].box!.centerKm;
  it('calls box at ≤10 km', () => {
    expect(driveState(trip, c - 30, 60).call).toBe(false);
    expect(driveState(trip, c - 9, 60).call).toBe(true);
  });
  it('moves to the next box after Pitted', () => {
    const t2 = { ...trip, log: [{ stopId: 'x', plannedAt: '', actualAt: '', boxIndex: 1 }] };
    expect(driveState(t2, c + 0.5, 60).next?.n).toBe(2);
  });
  it('briefing is 5 plain lines', () => {
    const f = briefFacts(trip);
    expect(f).toHaveLength(5);
    expect(f.join(' ')).not.toContain('!');
    expect(cleanBrief('1. Go now!\n- **Fuel** at km 4\n5 stints today')).toEqual(['Go now.', 'Fuel at km 4', '5 stints today']);
  });
});
