// Fails if the client build contains anything that looks like an API key.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const patterns = [
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/5b3ce3597851110001cf6248[0-9a-f]{24,}/i, 'ORS API key'],
  [/eyJvcmciOi[0-9A-Za-z_=-]{20,}/, 'ORS API key (JWT form)'],
  [/GEMINI_API_KEY|ORS_API_KEY/, 'secret variable name'],
];
const envKeys = [process.env.ORS_API_KEY, process.env.GEMINI_API_KEY].filter((v) => v && v.length > 8);
let bad = 0;
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else {
      const s = readFileSync(p, 'utf8');
      for (const [re, name] of patterns) if (re.test(s)) { console.error(`FAIL ${p}: ${name}`); bad++; }
      for (const k of envKeys) if (s.includes(k)) { console.error(`FAIL ${p}: contains a configured secret`); bad++; }
    }
  }
};
walk(dir);
console.log(bad ? `${bad} secret(s) found` : `No API keys in ${dir}`);
process.exit(bad ? 1 : 0);
