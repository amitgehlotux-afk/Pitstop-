import { PHASES } from '../lib/phase';
import { useTheme } from '../theme/useDayPhase';

/** Thin band carrying the time of day. Each phase is its own layer so the gradient can cross-fade. */
export function SkyBand() {
  const { phase } = useTheme();
  return (
    <div className="sky-band" aria-hidden="true">
      {PHASES.map((p) => (
        <span key={p} className={`sky-layer sky-${p}`} data-on={p === phase || undefined} />
      ))}
    </div>
  );
}
