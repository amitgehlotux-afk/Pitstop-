// Shared by the client (labels) and the /api/stops Function (query + parsing).
// Overpass usage policy: one query per box window, modest timeout, identify the client, back off on 429.

export type OsmKind = 'fuel' | 'restroom' | 'cafe' | 'food' | 'dog' | 'rest_area';

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface RawStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kinds: OsmKind[];
  osmTags: Record<string, string>;
}

export const KIND_LABEL: Record<OsmKind, string> = {
  fuel: 'Fuel',
  restroom: 'Restroom',
  cafe: 'Coffee',
  food: 'Food',
  dog: 'Open space',
  rest_area: 'Rest area',
};

export const CORRIDOR_M = 2000;

/**
 * Overpass QL for a corridor: `around` with a polyline (lat,lng pairs) finds features within
 * CORRIDOR_M of the route segment.
 */
export function buildCorridorQuery(points: [number, number][], radiusM = CORRIDOR_M): string {
  // points are [lng, lat]; Overpass wants lat,lon
  const poly = points.map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',');
  const a = `(around:${radiusM},${poly})`;
  return `[out:json][timeout:25];
(
  nwr${a}[amenity=fuel];
  nwr${a}[amenity=toilets];
  nwr${a}[amenity=cafe];
  nwr${a}[amenity~"^(restaurant|fast_food|food_court)$"];
  nwr${a}[highway~"^(services|rest_area)$"];
  nwr${a}[leisure~"^(park|picnic_site|dog_park)$"];
  nwr${a}[tourism=picnic_site];
);
out center tags 300;`;
}

export function classify(tags: Record<string, string>): OsmKind[] {
  const k = new Set<OsmKind>();
  const amenity = tags.amenity;
  if (amenity === 'fuel') k.add('fuel');
  if (amenity === 'toilets' || tags.toilets === 'yes' || tags['toilets:access'] === 'customers' || tags['toilets:access'] === 'yes') k.add('restroom');
  if (amenity === 'cafe' || /coffee|tea/.test(tags.cuisine ?? '') || tags.shop === 'coffee') k.add('cafe');
  if (amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'food_court') k.add('food');
  if (tags.highway === 'services' || tags.highway === 'rest_area') {
    k.add('rest_area');
    k.add('restroom');
  }
  if (tags.leisure === 'park' || tags.leisure === 'picnic_site' || tags.leisure === 'dog_park' || tags.tourism === 'picnic_site') k.add('dog');
  return [...k];
}

function nameOf(tags: Record<string, string>, kinds: OsmKind[]): string {
  const n = tags['name:en'] || tags.name || tags.brand || tags.operator;
  if (n) return n;
  return kinds.length ? `Unnamed ${KIND_LABEL[kinds[0]].toLowerCase()}` : 'Unnamed place';
}

export function parseElements(elements: OsmElement[]): RawStop[] {
  const out: RawStop[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;
    const tags = el.tags ?? {};
    const kinds = classify(tags);
    if (!kinds.length) continue;
    // keep only tags useful to people and to the pit-wall check
    const keep: Record<string, string> = {};
    for (const key of ['name', 'name:en', 'brand', 'operator', 'amenity', 'cuisine', 'opening_hours', 'toilets', 'toilets:access', 'highway', 'leisure', 'tourism', 'addr:city', 'addr:street', 'shop']) {
      if (tags[key]) keep[key] = tags[key];
    }
    out.push({ id: `osm:${el.type}/${el.id}`, name: nameOf(tags, kinds), lat, lng, kinds, osmTags: keep });
  }
  return out;
}

export function osmUrl(id: string): string {
  // id like osm:node/123
  return `https://www.openstreetmap.org/${id.replace(/^osm:/, '')}`;
}
