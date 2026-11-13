const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export const hhmm = (iso: string | Date) => timeFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
export const day = (iso: string | Date) => dayFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
export const km = (n: number) => `${Math.round(n)} km`;
export const km1 = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)} km`;

export function duration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** value for <input type="datetime-local"> in the device's local time */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function signedMin(min: number): string {
  const r = Math.round(min);
  if (r === 0) return 'on time';
  return r > 0 ? `${r} min late` : `${-r} min early`;
}
