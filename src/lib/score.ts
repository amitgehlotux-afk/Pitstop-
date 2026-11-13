import type { Need, Stop } from '../types';
import type { RawStop, OsmKind } from './overpass';
import { haversineKm, project, type Measured } from './geo';

export const CLUSTER_M = 300;
/** road detour is longer than straight-line offset; out and back */
const DETOUR_FACTOR = 1.3 * 2;

const NEED_KIND: Record<Need, OsmKind[]> = {
  fuel: ['fuel'],
  restroom: ['restroom', 'rest_area'],
  coffee: ['cafe'],
  food: ['food', 'rest_area'],
  dogBreak: ['dog'],
};

const NEED_WEIGHT: Record<Need, number> = { fuel: 40, restroom: 18, coffee: 14, food: 16, dogBreak: 12 };

export interface ScoreContext {
  need: Need[];
  centerKm: number;
  priorities: string[];
  dog: boolean;
  route: Measured;
}

/** Group raw OSM features into pit sites: an anchor plus everything within CLUSTER_M of it. */
export function cluster(raw: RawStop[], need: Need[]): { anchor: RawStop; members: RawStop[] }[] {
  const primary: OsmKind[] = need.includes('fuel')
    ? ['fuel']
    : ['rest_area', 'cafe', 'food', 'fuel'];
  const anchors = raw.filter((r) => r.kinds.some((k) => primary.includes(k)));
  return anchors.map((anchor) => ({
    anchor,
    members: raw.filter(
      (r) => r.id !== anchor.id && haversineKm([anchor.lng, anchor.lat], [r.lng, r.lat]) * 1000 <= CLUSTER_M,
    ),
  }));
}

export function scoreSite(
  anchor: RawStop,
  members: RawStop[],
  ctx: ScoreContext,
): Stop {
  const kinds = new Set<string>(anchor.kinds);
  members.forEach((m) => m.kinds.forEach((k) => kinds.add(k)));
  const has = (n: Need) => NEED_KIND[n].some((k) => kinds.has(k));

  let score = 0;
  for (const n of ctx.need) {
    let w = NEED_WEIGHT[n];
    if (n === 'restroom' && ctx.priorities.includes('restrooms')) w += 10;
    if (n === 'coffee' && ctx.priorities.includes('coffee')) w += 4;
    if (n === 'food' && ctx.priorities.includes('food')) w += 6;
    if (has(n)) score += w;
  }
  // cluster bonus: fuel + restroom + cafe within 300 m
  const clusterBonus = kinds.has('fuel') && (kinds.has('restroom') || kinds.has('rest_area')) && kinds.has('cafe');
  if (clusterBonus) score += 20;
  // dog: park, shade, open space close by
  if (ctx.dog && kinds.has('dog')) score += 8;
  if (ctx.priorities.includes('scenery') && (kinds.has('dog') || anchor.osmTags.tourism)) score += 4;
  // named places with hours are easier to check
  if (anchor.osmTags.name || anchor.osmTags.brand) score += 3;
  if (anchor.osmTags.opening_hours) score += 2;

  const p = project(ctx.route, [anchor.lng, anchor.lat]);
  const detourKm = Math.round(p.offKm * DETOUR_FACTOR * 10) / 10;
  score -= detourKm * 4;
  score -= Math.abs(p.km - ctx.centerKm) * 0.6;

  const tags = { ...anchor.osmTags };
  if (members.length) tags['pitstop:nearby'] = members.map((m) => m.name).slice(0, 4).join('; ');

  return {
    id: anchor.id,
    name: anchor.name,
    lat: anchor.lat,
    lng: anchor.lng,
    kinds: [...kinds],
    detourKm,
    score: Math.round(score * 10) / 10,
    osmTags: tags,
    routeKm: Math.round(p.km * 10) / 10,
  };
}

/** Rank pit sites for a box window and return the top `limit`. Fuel is a hard requirement when needed. */
export function rank(raw: RawStop[], ctx: ScoreContext, limit = 3): Stop[] {
  const sites = cluster(raw, ctx.need).map(({ anchor, members }) => scoreSite(anchor, members, ctx));
  const filtered = ctx.need.includes('fuel') ? sites.filter((s) => s.kinds.includes('fuel')) : sites;
  // De-duplicate sites that are effectively the same place (two anchors in one cluster).
  const sorted = filtered.sort((a, b) => b.score - a.score);
  const picked: Stop[] = [];
  for (const s of sorted) {
    if (picked.some((p) => haversineKm([p.lng, p.lat], [s.lng, s.lat]) * 1000 < 150)) continue;
    picked.push(s);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function needMatches(stop: Stop, need: Need[]): Need[] {
  return need.filter((n) => NEED_KIND[n].some((k) => stop.kinds.includes(k)));
}
