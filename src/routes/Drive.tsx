import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useTrip } from '../state/TripContext';
import { useTheme } from '../theme/useDayPhase';
import { debugLocation, now } from '../lib/clock';
import { measure, project } from '../lib/geo';
import { driveState, planKmAt } from '../lib/drive';
import { duration, hhmm, km1 } from '../lib/format';
import { PHASE_LABEL } from '../lib/phase';
import { safeGet, safeSet } from '../lib/storage';
import { RouteMap } from '../components/RouteMap';
import { navigate } from '../app';
import type { Need } from '../types';

const NEED_WORD: Record<Need, string> = { fuel: 'fuel', restroom: 'restroom', coffee: 'coffee', food: 'food', dogBreak: 'dog break' };
const SPEECH_KEY = 'pitstop.speech';

type Fix = { km: number; offKm: number; speedKmh: number | null; at: number };

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const req = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => undefined);
    void req();
    const onVis = () => document.visibilityState === 'visible' && void req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

export function Drive() {
  const { trip, logPit, logFinish, startDrive } = useTrip();
  const { phase } = useTheme();
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [speech, setSpeech] = useState(() => safeGet(SPEECH_KEY) === '1');
  const spoken = useRef<Set<number>>(new Set());
  const m = useMemo(() => (trip?.route ? measure(trip.route.geometry, trip.route.distanceKm) : null), [trip?.route]);

  useWakeLock(!!trip);
  useEffect(() => {
    startDrive();
  }, [startDrive]);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!m) return;
    const dbg = debugLocation();
    if (dbg) {
      const p = project(m, [dbg.lng, dbg.lat]);
      setFix({ km: p.km, offKm: p.offKm, speedKmh: null, at: Date.now() });
      return;
    }
    if (!('geolocation' in navigator)) {
      setGeoError('No GPS on this device. Showing the plan.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = project(m, [pos.coords.longitude, pos.coords.latitude]);
        const speed = pos.coords.speed;
        setFix({ km: p.km, offKm: p.offKm, speedKmh: speed !== null && speed >= 0 ? speed * 3.6 : null, at: pos.timestamp });
        setGeoError(null);
      },
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? 'Location is off. Showing the plan.' : 'No GPS fix yet. Showing the plan.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [m]);

  const route = trip?.route;
  const avgKmh = route ? (route.distanceKm / Math.max(1, route.durationMin)) * 60 : 60;
  const useGps = !!fix && fix.offKm < 3;
  const currentKm = fix && useGps ? fix.km : trip ? planKmAt(trip, now()) : 0;
  const speed = fix && useGps && fix.speedKmh && fix.speedKmh > 15 ? fix.speedKmh : avgKmh;
  const st = trip ? driveState(trip, currentKm, speed) : null;
  const summary = st?.next?.box
    ? `${st.target?.name ?? 'any stop near km ' + Math.round(st.next.box.centerKm)}, ${st.next.box.need.map((n) => NEED_WORD[n]).join(', ')}`
    : '';

  useBoxSpeech(speech, st?.call && st.next ? st.next.n : null, `Box in ${Math.round(st?.kmToBox ?? 0)} kilometres. ${summary}`, spoken);

  if (!trip || !trip.route || !st) {
    return (
      <div className="page">
        <h1>Drive</h1>
        <p>Plan a trip first.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('plan')}>
          Plan the race
        </button>
      </div>
    );
  }


  const finishLogged = trip.log.some((l) => l.stopId === 'finish');
  return (
    <div className={`page drive drive-${phase}`}>
      <h1 className="visually-hidden">Drive</h1>
      <p className="drive-source small muted" role="status">
        {useGps ? `GPS · km ${Math.round(currentKm)}` : geoError ?? (fix && fix.offKm >= 3 ? 'Off the planned route. Showing the plan.' : 'Waiting for GPS. Showing the plan.')}
      </p>

      {st.call && st.next && (
        <div className="box-call" role="alert">
          <span className="box-call-label">Box</span>
          <p className="box-call-text">
            Box in {km1(st.kmToBox ?? 0)}: {summary}
          </p>
        </div>
      )}

      <section className="drive-panel" aria-labelledby="cur-h">
        <h2 id="cur-h" className="drive-label">
          Stint {st.current?.n ?? '–'} of {trip.stints.length}
        </h2>
        {st.current && (
          <p className="drive-big tabular">
            {hhmm(st.current.startAt)}–{hhmm(st.current.endAt)}
          </p>
        )}
        {st.current && (
          <p className="drive-sub">
            {PHASE_LABEL[st.current.phase]} · {Math.round(st.current.toKm - currentKm)} km left in stint
            {st.current.flags.includes('night') && ' · Night'}
            {st.current.flags.includes('climb') && ' · Climb'}
          </p>
        )}
      </section>

      <section className="drive-panel" aria-labelledby="next-h">
        <h2 id="next-h" className="drive-label">
          Next box
        </h2>
        {st.next?.box ? (
          <>
            <p className="drive-huge tabular">{km1(st.kmToBox ?? 0)}</p>
            <p className="drive-sub">
              about {duration(st.minToBox ?? 0)} · {st.next.box.need.map((n) => NEED_WORD[n]).join(', ')}
            </p>
            <p className="drive-sub">{st.target ? st.target.name : 'No stop locked. Any candidate near km ' + Math.round(st.next.box.centerKm)}</p>
            <button type="button" className="btn btn-box btn-huge" onClick={() => logPit(st.next!.n)}>
              Pitted
            </button>
          </>
        ) : (
          <>
            <p className="drive-big">No more boxes</p>
            <button type="button" className="btn btn-primary btn-huge" onClick={() => { if (!finishLogged) logFinish(); navigate('debrief'); }}>
              {finishLogged ? 'Debrief' : 'Arrived'}
            </button>
          </>
        )}
      </section>

      <div className="drive-tools">
        <label className="check">
          <input
            type="checkbox"
            checked={speech}
            onChange={(e) => {
              setSpeech(e.target.checked);
              safeSet(SPEECH_KEY, e.target.checked ? '1' : '0');
            }}
          />{' '}
          Speak box calls
        </label>
        <button type="button" className="btn btn-quiet" onClick={() => navigate('debrief')}>
          Debrief
        </button>
      </div>

      <div className="drive-map">
        <RouteMap trip={trip} compact />
      </div>
    </div>
  );
}

function useBoxSpeech(enabled: boolean, boxN: number | null, text: string, spoken: MutableRefObject<Set<number>>) {
  useEffect(() => {
    if (!enabled || boxN === null || spoken.current.has(boxN) || !('speechSynthesis' in window)) return;
    spoken.current.add(boxN);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-IN';
    window.speechSynthesis.speak(u);
  }, [enabled, boxN, text, spoken]);
}
