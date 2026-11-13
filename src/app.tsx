import { useEffect, useState } from 'react';
import { DayPhaseContext, useDayPhase } from './theme/useDayPhase';
import { ThemeMenu } from './theme/ThemeMenu';
import { TripProvider, useTrip } from './state/TripContext';
import { SkyBand } from './components/SkyBand';
import { Attribution } from './components/Attribution';
import { Plan } from './routes/Plan';
import { Strategy } from './routes/Strategy';
import { Drive } from './routes/Drive';
import { Debrief } from './routes/Debrief';

export type RouteName = 'plan' | 'strategy' | 'drive' | 'debrief';
const ROUTES: { name: RouteName; label: string }[] = [
  { name: 'plan', label: 'Plan' },
  { name: 'strategy', label: 'Strategy' },
  { name: 'drive', label: 'Drive' },
  { name: 'debrief', label: 'Debrief' },
];

function parseRoute(): RouteName {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES.find((r) => r.name === h)?.name ?? 'plan') as RouteName;
}

/** hash routing keeps Cloudflare Pages static and preserves ?now= debug params in the query */
export function navigate(r: RouteName) {
  window.location.hash = `/${r}`;
}

function useRoute(): RouteName {
  const [r, setR] = useState<RouteName>(parseRoute);
  useEffect(() => {
    const on = () => {
      setR(parseRoute());
      // move focus to the new page heading for screen reader and keyboard users
      requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: false }));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

function Shell() {
  const { trip } = useTrip();
  const theme = useDayPhase(trip?.origin);
  const route = useRoute();
  return (
    <DayPhaseContext.Provider value={theme}>
      <div className={`app route-${route}`} data-theme={theme.phase}>
        <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
          Skip to content
        </a>
        <SkyBand />
        <header className="top">
          <a className="brand" href="#/plan">
            <span className="brand-mark" aria-hidden="true">P</span>Pitstop
          </a>
          <nav aria-label="Sections">
            <ul>
              {ROUTES.map((r) => (
                <li key={r.name}>
                  <a href={`#/${r.name}`} aria-current={route === r.name ? 'page' : undefined}>
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeMenu />
        </header>
        <main id="main" tabIndex={-1}>
          {route === 'plan' && <Plan />}
          {route === 'strategy' && <Strategy />}
          {route === 'drive' && <Drive />}
          {route === 'debrief' && <Debrief />}
        </main>
        {route !== 'drive' && <Attribution />}
        {route === 'drive' && (
          <footer className="attribution attribution-min">
            © OpenStreetMap contributors · ORS · OpenFreeMap · Checks: Google Maps via Gemini
          </footer>
        )}
      </div>
    </DayPhaseContext.Provider>
  );
}

export function App() {
  return (
    <TripProvider>
      <Shell />
    </TripProvider>
  );
}
