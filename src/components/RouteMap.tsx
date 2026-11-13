import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import type { Phase, Trip } from '../types';
import { measure, pointAtKm, sliceKm } from '../lib/geo';
import { useTheme } from '../theme/useDayPhase';

// OpenFreeMap style names: liberty (light), dark (dark).
const STYLE: Record<Phase, string> = {
  morning: 'https://tiles.openfreemap.org/styles/liberty',
  afternoon: 'https://tiles.openfreemap.org/styles/liberty',
  evening: 'https://tiles.openfreemap.org/styles/dark',
  night: 'https://tiles.openfreemap.org/styles/dark',
};

// Same values as --tint-* in tokens.css
const TINT: Record<Phase, string> = { morning: '#F2A649', afternoon: '#3FA7D6', evening: '#E5604D', night: '#4B5BD6' };

function buildData(trip: Trip) {
  const route = trip.route!;
  const m = measure(route.geometry, route.distanceKm);
  const segments = {
    type: 'FeatureCollection' as const,
    features: trip.stints.map((s) => ({
      type: 'Feature' as const,
      properties: { n: s.n, color: TINT[s.phase] },
      geometry: { type: 'LineString' as const, coordinates: sliceKm(m, s.fromKm, s.toKm).map((p) => [p[0], p[1]]) },
    })),
  };
  const boxes = {
    type: 'FeatureCollection' as const,
    features: trip.stints
      .filter((s) => s.box)
      .map((s) => ({
        type: 'Feature' as const,
        properties: { label: `Box ${s.n}` },
        geometry: { type: 'Point' as const, coordinates: pointAtKm(m, s.box!.centerKm) },
      })),
  };
  // OSM candidates only. Google Maps places never go on this map.
  const osm = {
    type: 'FeatureCollection' as const,
    features: trip.stints.flatMap((s) =>
      (s.box?.candidates ?? []).map((c) => ({
        type: 'Feature' as const,
        properties: { name: c.name, locked: c.id === s.box!.locked ? 1 : 0 },
        geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
      })),
    ),
  };
  const lngs = route.geometry.map((p) => p[0]);
  const lats = route.geometry.map((p) => p[1]);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
  return { segments, boxes, osm, bounds };
}

function addLayers(map: MlMap, data: ReturnType<typeof buildData>, dark: boolean) {
  const casing = dark ? '#000000' : '#FFFFFF';
  const ink = dark ? '#FFFFFF' : '#1E1A16';
  map.addSource('stints', { type: 'geojson', data: data.segments });
  map.addSource('boxes', { type: 'geojson', data: data.boxes });
  map.addSource('osm', { type: 'geojson', data: data.osm });
  map.addLayer({ id: 'stint-casing', type: 'line', source: 'stints', paint: { 'line-color': casing, 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  map.addLayer({ id: 'stint-line', type: 'line', source: 'stints', paint: { 'line-color': ['get', 'color'], 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  map.addLayer({ id: 'osm-pts', type: 'circle', source: 'osm', paint: { 'circle-radius': ['case', ['==', ['get', 'locked'], 1], 7, 5], 'circle-color': ['case', ['==', ['get', 'locked'], 1], '#C8102E', ink], 'circle-stroke-color': casing, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'box-pts', type: 'circle', source: 'boxes', paint: { 'circle-radius': 9, 'circle-color': '#C8102E', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } });
  map.addLayer({
    id: 'box-labels',
    type: 'symbol',
    source: 'boxes',
    layout: { 'text-field': ['get', 'label'], 'text-size': 13, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Noto Sans Bold'] },
    paint: { 'text-color': ink, 'text-halo-color': casing, 'text-halo-width': 2 },
  });
}

export function RouteMap({ trip, compact = false }: { trip: Trip; compact?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const { phase } = useTheme();
  const [failed, setFailed] = useState(false);
  const dark = phase === 'evening' || phase === 'night';
  const tripRef = useRef(trip);
  tripRef.current = trip;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const dataKey = JSON.stringify(trip.stints.map((s) => [s.n, s.phase, s.box?.candidates.map((c) => c.id), s.box?.locked]));

  // create once per trip
  useEffect(() => {
    if (!el.current || !trip.route) return;
    let disposed = false;
    import('maplibre-gl')
      .then(async (ml) => {
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (disposed || !el.current) return;
        const data = buildData(trip);
        const map = new ml.Map({
          container: el.current,
          style: STYLE[phase],
          bounds: data.bounds,
          fitBoundsOptions: { padding: 32 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
        // runs on first load and after every setStyle; reads the latest trip and theme
        map.on('style.load', () => {
          if (!map.getSource('stints')) addLayers(map, buildData(tripRef.current), darkRef.current);
        });
        map.on('error', (e) => {
          if (String((e as { error?: Error }).error?.message ?? '').includes('style')) setFailed(true);
        });
        mapRef.current = map;
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [trip.id]);

  // style follows the theme: light for morning/afternoon, dark for evening/night
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(STYLE[phase]);
  }, [dark]);

  // data updates (candidates arrive, locks change)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource('osm')) return;
    const data = buildData(trip);
    (map.getSource('stints') as GeoJSONSource).setData(data.segments);
    (map.getSource('boxes') as GeoJSONSource).setData(data.boxes);
    (map.getSource('osm') as GeoJSONSource).setData(data.osm);
  }, [dataKey]);

  if (!trip.route) return null;
  return (
    <section className={`card map-card ${compact ? 'map-compact' : ''}`} aria-labelledby="map-h">
      <h2 id="map-h" className={compact ? 'visually-hidden' : undefined}>
        Route map
      </h2>
      {!compact && (
        <ul className="legend" aria-label="Map legend">
          <li><span className="sw sw-route" aria-hidden="true" />Stints, tinted by time of day</li>
          <li><span className="sw sw-box" aria-hidden="true" />Box windows</li>
          <li><span className="sw sw-osm" aria-hidden="true" />OSM candidates</li>
        </ul>
      )}
      <div
        ref={el}
        className="map"
        role="region"
        aria-label="Route map. The timing tower lists the same stints and stops as text."
      />
      {failed && <p className="notice small">The map could not load. The timing tower has everything you need.</p>}
    </section>
  );
}
