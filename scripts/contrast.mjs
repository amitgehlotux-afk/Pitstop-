// Checks WCAG contrast for every theme token pair the UI relies on. Exit 1 on failure.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/theme/tokens.css', import.meta.url), 'utf8');
const themes = {};
for (const m of css.matchAll(/\[data-theme='(\w+)'\]\s*\{([^}]*)\}/g)) {
  const vars = {};
  for (const v of m[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) vars[v[1]] = v[2];
  themes[m[1]] = vars;
}
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const pairs = [
  ...['text', 'muted', 'accent', 'box'].flatMap((fg) => ['bg', 'surface'].map((bg) => [fg, bg, 4.5])),
  ['on-box', 'box', 4.5],
  ['on-accent', 'accent', 4.5],
  ['line-strong', 'bg', 3],
  ['line-strong', 'surface', 3],
];
let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  for (const [fg, bg, min] of pairs) {
    if (!t[fg] || !t[bg]) continue;
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(9)} --${fg} on --${bg}: ${r.toFixed(2)} (min ${min})`);
  }
}
if (!Object.keys(themes).length) {
  console.error('no themes parsed');
  process.exit(1);
}
process.exit(failed ? 1 : 0);
