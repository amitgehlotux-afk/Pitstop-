import { useTrip } from '../state/TripContext';
import { hhmm, signedMin, duration } from '../lib/format';
import { navigate } from '../app';

const diffMin = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;

export function Debrief() {
  const { trip } = useTrip();
  if (!trip) {
    return (
      <div className="page">
        <h1>Debrief</h1>
        <p>No trip yet.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('plan')}>
          Plan the race
        </button>
      </div>
    );
  }
  const boxes = trip.stints.filter((s) => s.box);
  const finish = trip.log.find((l) => l.stopId === 'finish');
  const last = trip.stints[trip.stints.length - 1];
  const start = trip.driveStartedAt;

  // actual stint k ends at the k-th "Pitted"; starts after the previous pit plus its planned stop time
  const actualEnd = (n: number) => (n === last.n ? finish?.actualAt : trip.log.find((l) => l.boxIndex === n)?.actualAt);
  const actualStart = (n: number): string | undefined => {
    if (n === 1) return start;
    const prev = trip.stints.find((s) => s.n === n - 1);
    const p = trip.log.find((l) => l.boxIndex === n - 1);
    return p && prev?.box ? new Date(new Date(p.actualAt).getTime() + prev.box.dwellMin * 60_000).toISOString() : undefined;
  };

  return (
    <div className="page debrief">
      <h1>Debrief</h1>
      <p className="lede">
        Planned arrival {hhmm(last.endAt)}
        {finish ? ` · actual ${hhmm(finish.actualAt)} · ${signedMin(diffMin(last.endAt, finish.actualAt))}` : ' · not arrived yet'}
      </p>

      <section className="card" aria-labelledby="db-stints">
        <h2 id="db-stints">Stints</h2>
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Planned and actual stint times</caption>
            <thead>
              <tr>
                <th scope="col">Stint</th>
                <th scope="col">Planned</th>
                <th scope="col">Actual</th>
                <th scope="col">Delta</th>
              </tr>
            </thead>
            <tbody>
              {trip.stints.map((s) => {
                const a = actualStart(s.n);
                const b = actualEnd(s.n);
                const planned = diffMin(s.startAt, s.endAt);
                const actual = a && b ? diffMin(a, b) : null;
                return (
                  <tr key={s.n}>
                    <th scope="row">{s.n}</th>
                    <td className="tabular">
                      {hhmm(s.startAt)}–{hhmm(s.endAt)} <span className="muted">({duration(planned)})</span>
                    </td>
                    <td className="tabular">{a && b ? `${hhmm(a)}–${hhmm(b)}` : b ? `–${hhmm(b)}` : '–'}</td>
                    <td>{actual !== null ? signedMin(actual - planned) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">Actual stint start assumes each stop took its planned time.</p>
      </section>

      <section className="card" aria-labelledby="db-stops">
        <h2 id="db-stops">Stops</h2>
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Planned and actual pit stops</caption>
            <thead>
              <tr>
                <th scope="col">Box</th>
                <th scope="col">Stop</th>
                <th scope="col">Planned</th>
                <th scope="col">Pitted</th>
                <th scope="col">Delay</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((s) => {
                const l = trip.log.find((x) => x.boxIndex === s.n);
                const stop = s.box!.candidates.find((c) => c.id === (l?.stopId ?? s.box!.locked));
                return (
                  <tr key={s.n}>
                    <th scope="row">{s.n}</th>
                    <td>{stop?.name ?? `near km ${Math.round(s.box!.centerKm)}`}</td>
                    <td className="tabular">{hhmm(s.endAt)}</td>
                    <td className="tabular">{l ? hhmm(l.actualAt) : 'skipped'}</td>
                    <td>{l ? signedMin(diffMin(l.plannedAt, l.actualAt)) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
