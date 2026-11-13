import { useId } from 'react';
import { PHASE_LABEL } from '../lib/phase';
import { useTheme, type ThemeMode } from './useDayPhase';

const OPTIONS: ThemeMode[] = ['auto', 'morning', 'afternoon', 'evening', 'night'];

export function ThemeMenu() {
  const { mode, setMode, sunPhase } = useTheme();
  const id = useId();
  return (
    <div className="theme-menu">
      <label htmlFor={id}>Theme</label>
      <select id={id} value={mode} onChange={(e) => setMode(e.target.value as ThemeMode)}>
        {OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o === 'auto' ? `Auto (${PHASE_LABEL[sunPhase].toLowerCase()} now)` : PHASE_LABEL[o]}
          </option>
        ))}
      </select>
    </div>
  );
}
