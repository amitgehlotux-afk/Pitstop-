export function Attribution() {
  return (
    <footer className="attribution">
      <p>
        Map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
        . Tiles by{' '}
        <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>{' '}
        ©{' '}
        <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">
          OpenMapTiles
        </a>
        . Routing and geocoding ©{' '}
        <a href="https://openrouteservice.org/" target="_blank" rel="noreferrer">
          openrouteservice.org by HeiGIT
        </a>
        . Stop candidates from OSM via Overpass API.
      </p>
      <p>
        Pit-wall checks: From Google Maps via Gemini. Google Maps places appear as text with links, never on the map.
      </p>
      <p>Pitstop stores trips on this device only. No account, no tracking.</p>
    </footer>
  );
}
