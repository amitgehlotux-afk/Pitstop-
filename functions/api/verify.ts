import type { Env } from '../_lib/env';
import { body, fail, json, validLatLng } from '../_lib/http';
import { bump, cacheGet, cachePut, peek, rateLimit, today } from '../_lib/store';
import { generate } from '../_lib/gemini';

interface StopIn { id: string; name: string; lat: number; lng: number; kinds?: string[]; osmTags?: Record<string, string> }
interface Verification { checkedAt: string; summary: string; openAtEta?: boolean | null; sources: { title: string; uri: string }[]; thin: boolean; widgetToken?: string }

const KIND_WORD: Record<string, string> = { fuel: 'fuel station', restroom: 'restrooms', cafe: 'cafe', food: 'restaurant', dog: 'open space', rest_area: 'highway rest area' };
const TTL = 24 * 3600;

function prompt(stop: StopIn, etaLocal: string, dog: boolean): string {
  const kinds = (stop.kinds ?? []).map((k) => KIND_WORD[k] ?? k).join(', ') || 'roadside stop';
  return [
    `A driver on an Indian highway plans to stop at "${stop.name}" near latitude ${stop.lat.toFixed(5)}, longitude ${stop.lng.toFixed(5)}.`,
    `OpenStreetMap lists it as: ${kinds}. They arrive around ${etaLocal} local time.`,
    'Using Google Maps, answer in at most three short, plain sentences:',
    '1) is it likely open at that time, 2) what reviews say about restrooms and cleanliness, 3) ' +
      (dog ? 'whether there is shade or open space for a dog.' : 'one practical note for a quick stop.'),
    'If you cannot find this exact place on Google Maps, say so. Do not guess. No exclamation marks.',
    'Then, on a final separate line, write exactly one of: OPEN_AT_ETA: yes | OPEN_AT_ETA: no | OPEN_AT_ETA: unknown',
  ].join('\n');
}

// POST {stop, etaLocal, dog?} → Verification   (Gemini + Grounding with Google Maps)
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await rateLimit(env, request, 'verify'))) return fail(429, 'Too many requests. Try again in a minute.');
  const b = await body<{ stop?: StopIn; etaLocal?: string; dog?: boolean }>(request);
  const stop = b?.stop;
  if (!stop || typeof stop.id !== 'string' || typeof stop.name !== 'string' || !validLatLng(stop)) return fail(400, 'Stop is required.');
  const etaLocal = String(b?.etaLocal ?? '').slice(0, 60);
  const name = stop.name.slice(0, 120);

  // cache per stop and arrival hour, 24 h
  const key = `verify:${stop.id}:${etaLocal.slice(0, 13)}:${b?.dog ? 1 : 0}`;
  const hit = await cacheGet<Verification>(env, key);
  if (hit) return json(hit);

  const cap = parseInt(env.MAX_VERIFY_PER_DAY ?? '200', 10) || 200;
  const dayKey = `verify-count:${today()}`;
  if ((await peek(env, dayKey)) >= cap) return fail(429, 'Checks paused for today.', { paused: true });
  if (!env.GEMINI_API_KEY) return fail(503, 'Checks are not configured.');
  await bump(env, dayKey, 36 * 3600);

  let result;
  try {
    result = await generate(env, prompt({ ...stop, name }, etaLocal, !!b?.dog), { maps: { lat: stop.lat, lng: stop.lng }, maxTokens: 300 });
  } catch {
    return fail(502, 'The check did not go through. Try again.');
  }
  const m = result.text.match(/OPEN_AT_ETA:\s*(yes|no|unknown)/i);
  const summary = result.text.replace(/OPEN_AT_ETA:.*$/im, '').replace(/!/g, '.').trim();
  const thin = result.sources.length === 0;
  const v: Verification = {
    checkedAt: new Date().toISOString(),
    // never present an unsourced check as fact: blank it when thin
    summary: thin ? '' : summary,
    openAtEta: thin || !m ? null : m[1].toLowerCase() === 'yes' ? true : m[1].toLowerCase() === 'no' ? false : null,
    sources: result.sources.slice(0, 5),
    thin,
    widgetToken: result.widgetToken,
  };
  await cachePut(env, key, v, TTL);
  return json(v);
};
