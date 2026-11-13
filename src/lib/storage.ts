import type { Trip } from '../types';

export const TRIPS_KEY = 'pitstop.trips';
export const THEME_KEY = 'pitstop.theme';
export const CURRENT_KEY = 'pitstop.current';

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage full or blocked: the app keeps working for this session
  }
}

export function loadTrips(): Trip[] {
  try {
    const raw = safeGet(TRIPS_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** keep the newest 10 trips; route geometry is the heavy part */
export function saveTrips(trips: Trip[]): void {
  const sorted = [...trips].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 10);
  safeSet(TRIPS_KEY, JSON.stringify(sorted));
}
