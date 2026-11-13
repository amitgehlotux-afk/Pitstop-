import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BoxWindow, Place, Stint, Stop, Trip } from '../types';
import * as api from '../lib/api';
import { ApiError } from '../lib/api';
import { planStints } from '../lib/stints';
import { rank } from '../lib/score';
import { measure, sliceKm, thin } from '../lib/geo';
import { CURRENT_KEY, loadTrips, safeGet, safeSet, saveTrips } from '../lib/storage';
import { briefFacts } from '../lib/brief';
import { now } from '../lib/clock';

export interface PlanForm {
  origin: string;
  destination: string;
  departAt: string; // datetime-local
  rangeKm: number;
  fuelPct: number;
  dog: boolean;
  kids: boolean;
  priorities: string[];
  stintMin: number;
  night: 'avoid' | 'ok';
}

export type CheckState = 'loading' | 'paused' | 'error';

interface TripCtx {
  trips: Trip[];
  trip: Trip | null;
  planning: { step: string } | null;
  planError: string | null;
  checks: Record<string, CheckState | undefined>;
  planStrategy: (f: PlanForm) => Promise<boolean>;
  selectTrip: (id: string) => void;
  deleteTrip: (id: string) => void;
  lockStop: (stintN: number, stopId: string) => Promise<void>;
  unlock: (stintN: number) => void;
  retryBox: (stintN: number) => void;
  logPit: (stintN: number) => void;
  logFinish: () => void;
  startDrive: () => void;
}

const Ctx = createContext<TripCtx | null>(null);
export const useTrip = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTrip outside provider');
  return v;
};

const LATLNG = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

async function resolvePlace(q: string): Promise<Place> {
  const m = q.match(LATLNG);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), label: q.trim() };
  return api.geocode(q);
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function boxEtaMid(b: BoxWindow): Date {
  return new Date((new Date(b.etaFrom).getTime() + new Date(b.etaTo).getTime()) / 2);
}

export function etaLocalString(b: BoxWindow): string {
  const d = boxEtaMid(b);
  const p = (n: number) => String(n).padStart(2, '0');
  // YYYY-MM-DDTHH:MM local, readable by people and by the model
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())} (${d.toLocaleDateString('en-IN', { weekday: 'long' })})`;
}

export function TripProvider({ children }: { children: ReactNode }) {
  // a reload mid-lookup leaves boxes "loading" with nothing in flight: reset them so they can retry
  const [trips, setTrips] = useState<Trip[]>(() =>
    loadTrips().map((t) => ({
      ...t,
      stints: t.stints.map((s) => (s.box?.status === 'loading' ? { ...s, box: { ...s.box, status: 'idle' as const } } : s)),
    })),
  );
  const [currentId, setCurrentId] = useState<string | null>(() => safeGet(CURRENT_KEY));
  const [planning, setPlanning] = useState<{ step: string } | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, CheckState | undefined>>({});
  const tripsRef = useRef(trips);
  tripsRef.current = trips;

  useEffect(() => saveTrips(trips), [trips]);
  useEffect(() => {
    if (currentId) safeSet(CURRENT_KEY, currentId);
  }, [currentId]);

  const trip = useMemo(() => trips.find((t) => t.id === currentId) ?? trips[0] ?? null, [trips, currentId]);

  const update = useCallback((id: string, fn: (t: Trip) => Trip) => {
    setTrips((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const updateBox = useCallback(
    (id: string, stintN: number, fn: (b: BoxWindow, s: Stint, t: Trip) => BoxWindow) =>
      update(id, (t) => ({ ...t, stints: t.stints.map((s) => (s.n === stintN && s.box ? { ...s, box: fn(s.box, s, t) } : s)) })),
    [update],
  );

  const loadBox = useCallback(
    async (t: Trip, s: Stint) => {
      if (!s.box || !t.route) return;
      updateBox(t.id, s.n, (b) => ({ ...b, status: 'loading', error: undefined }));
      try {
        const m = measure(t.route.geometry, t.route.distanceKm);
        const from = Math.max(0, s.box.centerKm - 15);
        const to = Math.min(t.route.distanceKm, s.box.centerKm + 8);
        let pts = thin(sliceKm(m, from, to), 0.8);
        if (pts.length > 60) pts = pts.filter((_, i) => i % Math.ceil(pts.length / 60) === 0 || i === pts.length - 1);
        const raw = await api.stops(pts as [number, number][]);
        const candidates = rank(raw, { need: s.box.need, centerKm: s.box.centerKm, priorities: t.priorities, dog: t.crew.dog, route: m });
        updateBox(t.id, s.n, (b) => ({ ...b, candidates, status: 'ready' }));
      } catch (e) {
        updateBox(t.id, s.n, (b) => ({ ...b, status: 'error', error: e instanceof ApiError ? e.message : 'Could not load stops.' }));
      }
    },
    [updateBox],
  );

  const planStrategy = useCallback(
    async (f: PlanForm): Promise<boolean> => {
      setPlanError(null);
      try {
        setPlanning({ step: 'Finding places' });
        const [origin, destination] = await Promise.all([resolvePlace(f.origin), resolvePlace(f.destination)]);
        setPlanning({ step: 'Getting the route' });
        const route = await api.route(origin, destination);
        if (!route.geometry?.length || !route.distanceKm) throw new ApiError('No driving route found.', 404);
        setPlanning({ step: 'Splitting stints' });
        const departAt = new Date(f.departAt);
        const { stints, advice } = planStints({
          route,
          departAt,
          stintMin: f.stintMin,
          car: { rangeKm: f.rangeKm, fuelPct: f.fuelPct },
          crew: { dog: f.dog, kids: f.kids },
          priorities: f.priorities,
          night: f.night,
        });
        const t: Trip = {
          id: uid(),
          origin,
          destination,
          departAt: departAt.toISOString(),
          car: { rangeKm: f.rangeKm, fuelPct: f.fuelPct },
          crew: { dog: f.dog, kids: f.kids },
          priorities: f.priorities,
          stintMin: f.stintMin,
          night: f.night,
          route,
          stints,
          log: [],
          advice,
          createdAt: now().toISOString(),
        };
        t.briefing = briefFacts(t).join('\n');
        setTrips((ts) => [t, ...ts]);
        setCurrentId(t.id);
        setPlanning(null);

        // Box windows one at a time (Overpass fair use), then the briefing.
        void (async () => {
          for (const s of stints) if (s.box) await loadBox(t, s);
          try {
            const r = await api.brief(t);
            if (r.text) update(t.id, (x) => ({ ...x, briefing: r.text }));
          } catch {
            // the template briefing stays
          }
        })();
        return true;
      } catch (e) {
        setPlanning(null);
        setPlanError(e instanceof ApiError ? e.message : 'Planning failed. Try again.');
        return false;
      }
    },
    [loadBox, update],
  );

  const lockStop = useCallback(
    async (stintN: number, stopId: string) => {
      const t = tripsRef.current.find((x) => x.id === currentId) ?? tripsRef.current[0];
      if (!t) return;
      const s = t.stints.find((x) => x.n === stintN);
      const stop = s?.box?.candidates.find((c) => c.id === stopId);
      if (!s?.box || !stop) return;
      updateBox(t.id, stintN, (b) => ({ ...b, locked: stopId, backup: undefined }));
      if (stop.verification) {
        applyThin(t.id, stintN, stop);
        return;
      }
      setChecks((c) => ({ ...c, [stopId]: 'loading' }));
      try {
        const v = await api.verify(stop, etaLocalString(s.box), t.crew.dog);
        updateBox(t.id, stintN, (b) => {
          const candidates = b.candidates.map((c) => (c.id === stopId ? { ...c, verification: v } : c));
          const backup = v.thin ? candidates.find((c) => c.id !== stopId)?.id : undefined;
          return { ...b, candidates, backup };
        });
        setChecks((c) => ({ ...c, [stopId]: undefined }));
      } catch (e) {
        const paused = e instanceof ApiError && e.data.paused === true;
        setChecks((c) => ({ ...c, [stopId]: paused ? 'paused' : 'error' }));
      }
    },
    [currentId, updateBox],
  );

  function applyThin(id: string, stintN: number, stop: Stop) {
    updateBox(id, stintN, (b) => ({
      ...b,
      backup: stop.verification?.thin ? b.candidates.find((c) => c.id !== stop.id)?.id : undefined,
    }));
  }

  const unlock = useCallback(
    (stintN: number) => trip && updateBox(trip.id, stintN, (b) => ({ ...b, locked: undefined, backup: undefined })),
    [trip, updateBox],
  );

  const retryBox = useCallback(
    (stintN: number) => {
      const s = trip?.stints.find((x) => x.n === stintN);
      if (trip && s) void loadBox(trip, s);
    },
    [trip, loadBox],
  );

  const logFinish = useCallback(() => {
    if (!trip) return;
    const last = trip.stints[trip.stints.length - 1];
    update(trip.id, (t) => ({
      ...t,
      log: [...t.log.filter((l) => l.stopId !== 'finish'), { stopId: 'finish', plannedAt: last.endAt, actualAt: now().toISOString(), atKm: last.toKm }],
    }));
  }, [trip, update]);

  const logPit = useCallback(
    (stintN: number) => {
      if (!trip) return;
      const s = trip.stints.find((x) => x.n === stintN);
      if (!s?.box) return;
      const stopId = s.box.locked ?? s.box.candidates[0]?.id ?? `box-${stintN}`;
      update(trip.id, (t) => ({
        ...t,
        log: [
          ...t.log.filter((l) => l.boxIndex !== stintN),
          { stopId, plannedAt: s.endAt, actualAt: now().toISOString(), boxIndex: stintN, atKm: s.box!.centerKm },
        ],
      }));
    },
    [trip, update],
  );

  const startDrive = useCallback(() => {
    if (trip && !trip.driveStartedAt) update(trip.id, (t) => ({ ...t, driveStartedAt: now().toISOString() }));
  }, [trip, update]);

  const value: TripCtx = {
    trips,
    trip,
    planning,
    planError,
    checks,
    planStrategy,
    selectTrip: setCurrentId,
    deleteTrip: (id) => setTrips((ts) => ts.filter((t) => t.id !== id)),
    lockStop,
    unlock,
    retryBox,
    logPit,
    logFinish,
    startDrive,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
