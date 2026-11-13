import type { StintFlag } from '../types';

const LABEL: Record<StintFlag, string> = { night: 'Night', fuelCritical: 'Fuel low', climb: 'Climb' };

export function Flags({ flags }: { flags: StintFlag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="flags" aria-label="Flags">
      {flags.map((f) => (
        <li key={f} className={`flag flag-${f}`}>
          {LABEL[f]}
        </li>
      ))}
    </ul>
  );
}
