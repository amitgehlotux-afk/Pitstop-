export type Phase = 'morning' | 'afternoon' | 'evening' | 'night';
export type Need = 'fuel' | 'restroom' | 'coffee' | 'food' | 'dogBreak';
export type StintFlag = 'night' | 'fuelCritical' | 'climb';
export type Priority = 'coffee' | 'restrooms' | 'food' | 'scenery';

export interface Place {
  lat: number;
  lng: number;
  label: string;
}

export interface Route {
  /** [lng, lat] or [lng, lat, elevationM] */
  geometry: number[][];
  distanceKm: number;
  durationMin: number;
  elevation?: { ascentM: number; descentM: number };
}

export interface Verification {
  checkedAt: string;
  summary: string;
  openAtEta?: boolean | null;
  sources: { title: string; uri: string }[];
  thin: boolean;
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** fuel | restroom | cafe | food | dog | rest_area */
  kinds: string[];
  detourKm: number;
  score: number;
  osmTags: Record<string, string>;
  verification?: Verification;
  /** km along the route where this stop sits (projected) */
  routeKm?: number;
}

export interface BoxWindow {
  centerKm: number;
  etaFrom: string;
  etaTo: string;
  need: Need[];
  candidates: Stop[];
  locked?: string;
  /** set when the locked stop's check came back thin; the backup stays pinned */
  backup?: string;
  dwellMin: number;
  status?: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
}

export interface Stint {
  n: number;
  startAt: string;
  endAt: string;
  fromKm: number;
  toKm: number;
  phase: Phase;
  flags: StintFlag[];
  fuelLeftPct: number;
  box?: BoxWindow;
}

export interface PitLog {
  stopId: string;
  plannedAt: string;
  actualAt: string;
  boxIndex?: number;
  atKm?: number;
}

export interface Trip {
  id: string;
  origin: Place;
  destination: Place;
  departAt: string;
  car: { rangeKm: number; fuelPct: number };
  crew: { dog: boolean; kids: boolean };
  priorities: string[];
  stintMin: number;
  night: 'avoid' | 'ok';
  route?: Route;
  stints: Stint[];
  log: PitLog[];
  briefing?: string;
  advice?: string[];
  createdAt?: string;
  driveStartedAt?: string;
}
