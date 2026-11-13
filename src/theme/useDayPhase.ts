import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Phase } from '../types';
import { BENGALURU, PHASES, phaseAt } from '../lib/phase';
import { debugLocation, now } from '../lib/clock';
import { safeGet, safeSet, THEME_KEY } from '../lib/storage';

export type ThemeMode = 'auto' | Phase;

export interface DayPhaseState {
  /** phase in effect (fixed override or the sun's) */
  phase: Phase;
  /** phase from the sun right now */
  sunPhase: Phase;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  location: { lat: number; lng: number; source: 'debug' | 'device' | 'route' | 'default' };
}

export const DayPhaseContext = createContext<DayPhaseState | null>(null);

export function useTheme(): DayPhaseState {
  const v = useContext(DayPhaseContext);
  if (!v) throw new Error('useTheme outside provider');
  return v;
}

function readMode(): ThemeMode {
  const v = safeGet(THEME_KEY);
  return v === 'auto' || PHASES.includes(v as Phase) ? (v as ThemeMode) : 'auto';
}

/**
 * Location for the sun: debug override → device (only if permission is already granted, so the
 * theme never triggers a prompt) → route origin → Bengaluru.
 */
export function useDayPhase(routeOrigin?: { lat: number; lng: number }): DayPhaseState {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [device, setDevice] = useState<{ lat: number; lng: number } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (debugLocation() || !('geolocation' in navigator) || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (p.state !== 'granted' || cancelled) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => !cancelled && setDevice({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => undefined,
          { maximumAge: 30 * 60_000, timeout: 10_000 },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // recompute every 60 s and when the tab becomes visible
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    const onVis = () => document.visibilityState === 'visible' && setTick((t) => t + 1);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const dbg = debugLocation();
  const location = dbg
    ? { ...dbg, source: 'debug' as const }
    : device
      ? { ...device, source: 'device' as const }
      : routeOrigin
        ? { ...routeOrigin, source: 'route' as const }
        : { ...BENGALURU, source: 'default' as const };

  void tick;
  const sunPhase = phaseAt(now(), location.lat, location.lng);
  const phase = mode === 'auto' ? sunPhase : mode;

  // apply to <html>, cross-fading when the phase actually changes
  const prev = useRef<Phase | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const changed = prev.current !== null && prev.current !== phase;
    if (changed) root.classList.add('theme-fade');
    root.dataset.theme = phase;
    prev.current = phase;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#FFF6EA');
    if (!changed) return;
    const t = window.setTimeout(() => root.classList.remove('theme-fade'), 650);
    return () => clearTimeout(t);
  }, [phase]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    safeSet(THEME_KEY, m);
  }, []);

  return { phase, sunPhase, mode, setMode, location };
}
