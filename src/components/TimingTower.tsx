import type { Need, Stint, Stop, Trip } from '../types';
import { duration, hhmm, km } from '../lib/format';
import { PHASE_LABEL } from '../lib/phase';
import { KIND_LABEL, osmUrl, type OsmKind } from '../lib/overpass';
import { needMatches } from '../lib/score';
import { useTrip } from '../state/TripContext';
import { Flags } from './Flags';
import { PitWallCheck } from './PitWallCheck';

const NEED_LABEL: Record<Need, string> = { fuel: 'Fuel', restroom: 'Restroom', coffee: 'Coffee', food: 'Food', dogBreak: 'Dog break' };

export function StintRow({ s, total }: { s: Stint; total: number }) {
  const mins = (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60_000;
  return (
    <li className={`stint-row tint-${s.phase}`} aria-labelledby={`stint-${s.n}`}>
      <div className="pos" aria-hidden="true">
        {s.n}
      </div>
      <div className="stint-main">
        <h3 id={`stint-${s.n}`} className="stint-title">
          Stint {s.n}
          <span className="phase-tag">{PHASE_LABEL[s.phase]}</span>
        </h3>
        <p className="stint-times">
          <span className="tabular">
            {hhmm(s.startAt)}–{hhmm(s.endAt)}
          </span>{' '}
          · {duration(mins)} · km {Math.round(s.fromKm)}–{Math.round(s.toKm)}
        </p>
        <Flags flags={s.flags} />
      </div>
      <div className="stint-fuel">
        <span className="small muted">Fuel left</span>
        <span className={`fuel-num tabular ${s.fuelLeftPct < 30 ? 'fuel-low' : ''}`}>{s.fuelLeftPct}%</span>
        <span className="fuel-bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, s.fuelLeftPct)}%` }} />
        </span>
        <span className="visually-hidden">{`, ${km(s.toKm - s.fromKm)} of ${km(total)}`}</span>
      </div>
    </li>
  );
}

function Candidate({ stop, s, locked, isBackup }: { stop: Stop; s: Stint; locked: boolean; isBackup: boolean }) {
  const { lockStop, unlock } = useTrip();
  const met = needMatches(stop, s.box!.need);
  const missing = s.box!.need.filter((n) => !met.includes(n));
  const nearby = stop.osmTags['pitstop:nearby'];
  return (
    <li className={`cand ${locked ? 'cand-locked' : ''}`}>
      <div className="cand-head">
        <h4 className="cand-name">{stop.name}</h4>
        <span className="tag tag-osm" title="Candidate from OpenStreetMap">
          OSM
        </span>
        {isBackup && <span className="tag tag-backup">Backup</span>}
      </div>
      <p className="small">
        {stop.kinds
          .filter((k): k is OsmKind => k in KIND_LABEL)
          .map((k) => KIND_LABEL[k])
          .join(' · ')}
      </p>
      <p className="small muted">
        {stop.detourKm <= 0.2 ? 'On the route' : `${stop.detourKm} km detour`}
        {stop.routeKm !== undefined && ` · km ${Math.round(stop.routeKm)}`}
        {missing.length > 0 && ` · no ${missing.map((n) => NEED_LABEL[n].toLowerCase()).join(', ')} listed`}
      </p>
      {nearby && <p className="small muted">Within 300 m: {nearby}</p>}
      {stop.osmTags.opening_hours && <p className="small muted">OSM hours: {stop.osmTags.opening_hours}</p>}
      <div className="cand-actions">
        <button
          type="button"
          className={locked ? 'btn btn-box' : 'btn'}
          aria-pressed={locked}
          onClick={() => (locked ? unlock(s.n) : lockStop(s.n, stop.id))}
        >
          {locked ? 'Locked' : 'Lock this stop'}
        </button>
        <a className="btn-link" href={osmUrl(stop.id)} target="_blank" rel="noreferrer">
          View on OSM
        </a>
      </div>
    </li>
  );
}

export function BoxWindowRow({ s }: { s: Stint }) {
  const { checks, retryBox, lockStop } = useTrip();
  const b = s.box!;
  const locked = b.candidates.find((c) => c.id === b.locked);
  const backup = b.candidates.find((c) => c.id === b.backup);
  return (
    <li className="box-window" aria-labelledby={`box-${s.n}`}>
      <div className="box-head">
        <span className="box-badge">Box</span>
        <h3 id={`box-${s.n}`} className="box-title">
          Box {s.n} · km {Math.round(b.centerKm)}
        </h3>
        <span className="tabular box-eta">
          {hhmm(b.etaFrom)}–{hhmm(b.etaTo)}
        </span>
      </div>
      <p className="small">
        Need: {b.need.map((n) => NEED_LABEL[n]).join(', ')} · about {b.dwellMin} min stop
      </p>
      {(b.status === 'loading' || b.status === undefined) && <p className="muted small">Looking for stops on OSM…</p>}
      {b.status === 'idle' && (
        <button type="button" className="btn" onClick={() => retryBox(s.n)}>
          Find stops
        </button>
      )}
      {b.status === 'error' && (
        <p className="notice">
          {b.error}{' '}
          <button type="button" className="btn-link" onClick={() => retryBox(s.n)}>
            Try again
          </button>
        </p>
      )}
      {b.status === 'ready' && b.candidates.length === 0 && (
        <p className="notice">No OSM stops matched here. Plan to stop in the nearest town, or retry later.</p>
      )}
      {b.candidates.length > 0 && (
        <ol className="cands" aria-label={`Candidates for box ${s.n}`}>
          {b.candidates.map((c) => (
            <Candidate key={c.id} stop={c} s={s} locked={c.id === b.locked} isBackup={c.id === b.backup} />
          ))}
        </ol>
      )}
      {locked && (
        <PitWallCheck stop={locked} state={checks[locked.id]} backup={backup} onRetry={() => lockStop(s.n, locked.id)} />
      )}
    </li>
  );
}

export function TimingTower({ trip }: { trip: Trip }) {
  const total = trip.route?.distanceKm ?? trip.stints[trip.stints.length - 1]?.toKm ?? 0;
  return (
    <section className="tower" aria-labelledby="tower-h">
      <h2 id="tower-h">Timing tower</h2>
      <ol className="tower-list">
        {trip.stints.flatMap((s) => {
          const rows = [<StintRow key={`s${s.n}`} s={s} total={total} />];
          if (s.box) rows.push(<BoxWindowRow key={`b${s.n}`} s={s} />);
          return rows;
        })}
        <li className="finish-row">
          <span className="box-badge finish-badge">Finish</span> {trip.destination.label} · {hhmm(trip.stints[trip.stints.length - 1].endAt)}
        </li>
      </ol>
    </section>
  );
}
