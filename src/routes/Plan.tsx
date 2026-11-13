import { useId, useState, type FormEvent } from 'react';
import { useTrip, type PlanForm } from '../state/TripContext';
import { toLocalInput, hhmm, day } from '../lib/format';
import { now } from '../lib/clock';
import { navigate } from '../app';

const PRIORITIES = [
  ['coffee', 'Filter coffee'],
  ['restrooms', 'Clean restrooms'],
  ['food', 'Food'],
  ['scenery', 'Scenery'],
] as const;

function defaults(): PlanForm {
  return {
    origin: 'Bengaluru',
    destination: 'Goa',
    departAt: toLocalInput(new Date(now().getTime() + 30 * 60_000)),
    rangeKm: 600,
    fuelPct: 100,
    dog: false,
    kids: false,
    priorities: ['coffee', 'restrooms'],
    stintMin: 120,
    night: 'avoid',
  };
}

export function Plan() {
  const { planStrategy, planning, planError, trips, selectTrip, deleteTrip } = useTrip();
  const [f, setF] = useState<PlanForm>(defaults);
  const id = useId();
  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (planning) return;
    if (await planStrategy(f)) navigate('strategy');
  }

  return (
    <div className="page plan">
      <h1>Plan the race</h1>
      <form onSubmit={submit} className="card form" noValidate>
        <fieldset>
          <legend>Route</legend>
          <div className="field">
            <label htmlFor={`${id}-o`}>From</label>
            <input id={`${id}-o`} required autoComplete="off" value={f.origin} onChange={(e) => set('origin', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-d`}>To</label>
            <input id={`${id}-d`} required autoComplete="off" value={f.destination} onChange={(e) => set('destination', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-t`}>Leave at</label>
            <input id={`${id}-t`} type="datetime-local" required value={f.departAt} onChange={(e) => set('departAt', e.target.value)} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Car</legend>
          <div className="row2">
            <div className="field">
              <label htmlFor={`${id}-r`}>Range on a full tank (km)</label>
              <input id={`${id}-r`} type="number" inputMode="numeric" min={100} max={1500} step={10} value={f.rangeKm} onChange={(e) => set('rangeKm', Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-f`}>Fuel now (%)</label>
              <input id={`${id}-f`} type="number" inputMode="numeric" min={5} max={100} step={5} value={f.fuelPct} onChange={(e) => set('fuelPct', Number(e.target.value))} />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Crew</legend>
          <label className="check">
            <input type="checkbox" checked={f.dog} onChange={(e) => set('dog', e.target.checked)} /> The dog is coming
          </label>
          <label className="check">
            <input type="checkbox" checked={f.kids} onChange={(e) => set('kids', e.target.checked)} /> Kids on board (stints capped at 90 min)
          </label>
        </fieldset>

        <fieldset>
          <legend>Priorities</legend>
          {PRIORITIES.map(([v, label]) => (
            <label key={v} className="check">
              <input
                type="checkbox"
                checked={f.priorities.includes(v)}
                onChange={(e) => set('priorities', e.target.checked ? [...f.priorities, v] : f.priorities.filter((p) => p !== v))}
              />{' '}
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Driving</legend>
          <div className="field">
            <label htmlFor={`${id}-s`}>Longest stint</label>
            <select id={`${id}-s`} value={f.stintMin} onChange={(e) => set('stintMin', Number(e.target.value))}>
              {[60, 90, 120, 150, 180].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
          <div className="radio-row" role="radiogroup" aria-label="Night driving">
            <span className="radio-label">Night driving</span>
            <label className="check">
              <input type="radio" name={`${id}-n`} checked={f.night === 'avoid'} onChange={() => set('night', 'avoid')} /> Avoid
            </label>
            <label className="check">
              <input type="radio" name={`${id}-n`} checked={f.night === 'ok'} onChange={() => set('night', 'ok')} /> Fine
            </label>
          </div>
        </fieldset>

        <button type="submit" className="btn btn-primary btn-wide" disabled={!!planning} aria-describedby={`${id}-status`}>
          {planning ? `${planning.step}…` : 'Plan the race'}
        </button>
        <p id={`${id}-status`} className="status" role="status" aria-live="polite">
          {planning ? planning.step : ''}
        </p>
        {planError && (
          <p className="notice" role="alert">
            {planError}
          </p>
        )}
      </form>

      {trips.length > 0 && (
        <section className="card" aria-labelledby={`${id}-saved`}>
          <h2 id={`${id}-saved`}>Saved trips</h2>
          <ul className="saved">
            {trips.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    selectTrip(t.id);
                    navigate('strategy');
                  }}
                >
                  {t.origin.label.split(',')[0]} → {t.destination.label.split(',')[0]}, {day(t.departAt)} {hhmm(t.departAt)}
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => deleteTrip(t.id)} aria-label={`Delete trip to ${t.destination.label}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
