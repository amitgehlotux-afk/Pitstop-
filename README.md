# Pitstop

Race strategy for Indian road trips. Pitstop splits a drive into stints, plans pit stops for fuel, restrooms, filter coffee and the dog, checks each stop against Google Maps, and calls "Box" while you drive.

- **Plan**: route, departure, car range and fuel, crew, priorities, stint limit, night driving.
- **Strategy**: timing tower of stints and box windows, a route map, pit-wall checks and a 5-line briefing.
- **Drive**: big type, the next box, a box call at ≤10 km or ≤10 min, a Pitted button.
- **Debrief**: planned against actual stints and stops.

No account. Trips stay in `localStorage` on the device.

## Stack

Vite, React and TypeScript · CSS custom properties per theme · React context · MapLibre GL JS with OpenFreeMap tiles · suncalc · Cloudflare Pages and Pages Functions.

```
src/
  app.tsx                 shell, hash routing, nav
  routes/                 Plan, Strategy, Drive, Debrief
  theme/                  tokens.css, useDayPhase.ts, ThemeMenu.tsx
  lib/                    stints.ts, score.ts, overpass.ts, geo.ts, phase.ts, drive.ts, brief.ts, api.ts, clock.ts
  components/             TimingTower, RouteMap, PitWallCheck, Briefing, SkyBand, Attribution, Flags
  state/TripContext.tsx   trips, planning, locking, pit log
functions/
  api/                    geocode, route, stops, verify, brief
  _lib/                   env, http, store (cache, counters, rate limit), gemini
```

## Run locally

```sh
npm install
cp .dev.vars.example .dev.vars   # add ORS_API_KEY and GEMINI_API_KEY
npm run dev:full                 # builds, then serves app + Functions on :8788
# or, for UI work with hot reload: run `npx wrangler pages dev dist` in one shell and `npm run dev` in another (Vite proxies /api to :8788)
```

Checks:

```sh
npm run typecheck
npm test                 # stint, phase, score, drive and briefing logic (TZ=Asia/Kolkata)
npm run check:contrast   # WCAG contrast for every theme token pair
npm run build && npm run check:secrets
npm run test:a11y        # Playwright + axe in all four themes, with the APIs mocked
```

CI (`.github/workflows/ci.yml`) runs all of these on every push.

### Debug overrides

`?now=ISO&lat=&lng=` overrides the clock and location, for example
`/?now=2026-11-14T20:00:00%2B05:30#/plan` shows the night theme. The clock keeps ticking from the override. `lat`/`lng` also stand in for GPS in Drive mode.

## How planning works

1. `/api/geocode` resolves both places (ORS geocoding, limited to India). You can also type `lat,lng`.
2. `/api/route` gets an ORS `driving-car` route with elevation.
3. `lib/stints.ts` splits the route:
   - each stint is at most the stint limit (90 min with kids) at the route's average speed;
   - a stint ends early when the tank would drop below 20% of a full tank, so you always box before 80% of range is used;
   - every box needs a restroom; fuel when the next leg would cross the reserve; coffee if it's a priority; food in meal windows; a dog break when the dog is coming;
   - flags: `night` when any part of the stint is between dusk and dawn, `fuelCritical` under 30% left, `climb` for a 300 m swing inside 15 km (ghats);
   - each stint's phase comes from its own midpoint time and position;
   - with night set to avoid, night stints are flagged with a suggested earlier departure, trimmed stops or an overnight box.
4. For each box window, one at a time, `/api/stops` runs one Overpass query for a 2 km corridor around the route segment near the box.
5. `lib/score.ts` groups features within 300 m into sites and ranks them: need match, a cluster bonus when fuel, restroom and cafe sit within 300 m, open space for the dog, minus detour and distance from the planned box. Fuel is required when the box needs fuel. The top 3 are shown.
6. `/api/brief` writes the 5-line briefing. The facts come from the plan. Gemini only rewords them, and its output is rejected unless it keeps every number. Otherwise the template text is used.

Locking a candidate calls `/api/verify`: Gemini with the Google Maps grounding tool, biased to the stop's location. If the response has no grounding sources, the check is marked thin, its text is dropped, and the app shows "Few reviews here. Keep the backup." with the second candidate pinned.

## Data honesty and attribution

- OSM candidates are labelled **OSM** and link to openstreetmap.org. They are the only places drawn on the map.
- Google-derived checks appear as text labelled **From Google Maps via Gemini**, with the source links Google returned. They are never drawn on the OSM map. A check without sources is never shown as fact.
- The footer credits OpenStreetMap contributors, OpenFreeMap/OpenMapTiles, openrouteservice (HeiGIT) and Google Maps. MapLibre's attribution control shows the tile credits on the map.
- Overpass: one query per box window, 25 s timeout, an identifying User-Agent, results cached for 6 hours, backoff on 429/504.

## Themes

Four token sets, `morning`, `afternoon`, `evening` and `night`, live on `[data-theme]` in `src/theme/tokens.css`. The schedule comes from suncalc at the device location (used only if location permission is already granted, so the theme never prompts), then the route origin, then Bengaluru:

| Phase | From | To |
|---|---|---|
| night | dusk | next dawn |
| morning | dawn | 11:00 |
| afternoon | 11:00 | golden hour |
| evening | golden hour | dusk |

The phase is recomputed on load, every 60 s and on `visibilitychange`. A change cross-fades over 600 ms, or switches instantly with `prefers-reduced-motion`. The Theme menu (Auto or a fixed phase) saves to `localStorage['pitstop.theme']`. The map uses OpenFreeMap `liberty` for morning and afternoon and `dark` for evening and night.

Two tokens are added to the spec: `--on-accent` for primary buttons and `--line-strong` for borders and controls that need 3:1. `npm run check:contrast` checks every pair: text, muted, accent and box reach at least 4.5:1 on bg and surface, and on-box at least 4.5:1 on box, in all four themes.

## API

Secrets live only in Pages Functions: `ORS_API_KEY`, `GEMINI_API_KEY`.

| Route | Body | Returns | Cache |
|---|---|---|---|
| `POST /api/geocode` | `{q}` | `{lat,lng,label}` | 7 d |
| `POST /api/route` | `{origin,destination}` | `{geometry,distanceKm,durationMin,elevation?}` | 24 h |
| `POST /api/stops` | `{corridor:[lng,lat][]}` | `{stops}` | 6 h per window |
| `POST /api/verify` | `{stop,etaLocal,dog}` | `Verification` | 24 h per stop and ETA hour |
| `POST /api/brief` | `{trip}` | `{text}` | none |

- Rate limit per IP: `RATE_LIMIT_PER_MIN`, default 30 per endpoint.
- Daily cap: `MAX_VERIFY_PER_DAY`, default 200, counted per India-local day. Over the cap the endpoint returns 429 `{paused:true}` and the UI shows "Checks paused for today".
- Model: `GEMINI_MODEL`, default `gemini-flash-latest`. Set it to a model that the Gemini docs list as supporting Grounding with Google Maps.
- Store: with a `PITSTOP_KV` binding, caches and counters are global and exact. Without it they use the Cache API, which is per data centre and best effort.

## Deploy (Cloudflare Pages)

```sh
npx wrangler pages project create pitstop --production-branch main
npx wrangler pages secret put ORS_API_KEY --project-name pitstop
npx wrangler pages secret put GEMINI_API_KEY --project-name pitstop
# optional, for exact caps: npx wrangler kv namespace create PITSTOP_KV, then uncomment it in wrangler.toml
npm run deploy
```

Then in the Cloudflare dashboard go to Pages → pitstop → Custom domains → add `pitstop.amitgehlot.com`. If DNS is on Cloudflare it adds the CNAME. Otherwise create `CNAME pitstop → pitstop.pages.dev`.

`public/_headers` sets a CSP that allows only this origin and `tiles.openfreemap.org`. There are no third-party scripts and no analytics.

## Assumptions and open items

- Defaults: 600 km range, 100% fuel, 120 min stints, night avoided, departure now + 30 min.
- Kids cap stints at 90 minutes. The spec gave kids no behaviour, so this is my choice.
- Stop times: 10 min base, +8 min for fuel, +25 for food or +10 for coffee, +10 for the dog.
- The box ETA window is ±8% of elapsed drive time, between 5 and 30 minutes.
- Debrief infers the actual start of each stint from the previous Pitted time plus the planned stop time, because v1 logs only Pitted.
- Before launch, check Google's current Grounding with Google Maps display and caching terms against `PitWallCheck.tsx` and the 24 h verify cache. The returned `googleMapsWidgetContextToken` is passed through but not rendered.
