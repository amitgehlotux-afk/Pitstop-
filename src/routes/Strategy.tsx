import { useTrip } from '../state/TripContext';
import { TimingTower } from '../components/TimingTower';
import { RouteMap } from '../components/RouteMap';
import { Briefing } from '../components/Briefing';
import { day, duration, hhmm, km } from '../lib/format';
import { navigate } from '../app';

export function Strategy() {
  const { trip } = useTrip();
  if (!trip) {
    return (
      <div className="page">
        <h1>Strategy</h1>
        <p>No trip yet.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('plan')}>
          Plan the race
        </button>
      </div>
    );
  }
  const last = trip.stints[trip.stints.length - 1];
  const totalMin = (new Date(last.endAt).getTime() - new Date(trip.departAt).getTime()) / 60_000;
  const nightAvoid = trip.night === 'avoid' && trip.stints.some((s) => s.flags.includes('night'));
  return (
    <div className="page strategy">
      <h1>
        {trip.origin.label.split(',')[0]} → {trip.destination.label.split(',')[0]}
      </h1>
      <p className="lede">
        {day(trip.departAt)} · leave {hhmm(trip.departAt)} · {km(trip.route?.distanceKm ?? last.toKm)} · {duration(totalMin)} with stops · arrive {hhmm(last.endAt)}
      </p>
      {nightAvoid && (
        <div className="notice notice-night" role="note">
          <p>
            <strong>Night stint planned.</strong> You asked to avoid night driving.
          </p>
          {trip.advice?.map((a) => <p key={a}>{a}</p>)}
        </div>
      )}
      <div className="strategy-grid">
        <div className="col-main">
          <TimingTower trip={trip} />
        </div>
        <div className="col-side">
          <Briefing text={trip.briefing} />
          <RouteMap trip={trip} />
          <button type="button" className="btn btn-primary btn-wide" onClick={() => navigate('drive')}>
            Start driving
          </button>
        </div>
      </div>
    </div>
  );
}
