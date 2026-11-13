import type { Stop } from '../types';
import type { CheckState } from '../state/TripContext';
import { hhmm } from '../lib/format';

interface Props {
  stop: Stop;
  state?: CheckState;
  backup?: Stop;
  onRetry: () => void;
}

/** Google Maps–grounded check for a locked stop. Text and links only. */
export function PitWallCheck({ stop, state, backup, onRetry }: Props) {
  const v = stop.verification;
  return (
    <section className="pitwall" aria-live="polite" aria-label={`Pit-wall check for ${stop.name}`}>
      <h4 className="pitwall-title">Pit-wall check</h4>
      {state === 'loading' && <p className="muted">Checking with Google Maps…</p>}
      {state === 'paused' && (
        <p className="notice">Checks paused for today. The OSM details above still apply.</p>
      )}
      {state === 'error' && (
        <p className="notice">
          The check did not go through.{' '}
          <button type="button" className="btn-link" onClick={onRetry}>
            Try again
          </button>
        </p>
      )}
      {v && !state && v.thin && (
        <div className="thin">
          <p>
            <strong>Few reviews here. Keep the backup.</strong>
          </p>
          {backup && (
            <p>
              Backup pinned: {backup.name} <span className="tag tag-osm">OSM</span>
              {backup.detourKm > 0 && <span className="muted"> · {backup.detourKm} km detour</span>}
            </p>
          )}
          <p className="muted small">Google Maps returned no sources for this place, so nothing here is confirmed.</p>
        </div>
      )}
      {v && !state && !v.thin && (
        <div>
          <p className="source-label">From Google Maps via Gemini</p>
          {v.openAtEta === true && <p className="chip chip-ok">Likely open at your ETA</p>}
          {v.openAtEta === false && <p className="chip chip-warn">May be closed at your ETA</p>}
          <p className="pitwall-summary">{v.summary}</p>
          <p className="small muted">Sources (Google Maps):</p>
          <ul className="sources">
            {v.sources.map((s) => (
              <li key={s.uri}>
                <a href={s.uri} target="_blank" rel="noreferrer">
                  {s.title}
                  <span className="visually-hidden"> (opens Google Maps)</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="small muted">Checked {hhmm(v.checkedAt)}. Reviews can be out of date.</p>
        </div>
      )}
    </section>
  );
}
