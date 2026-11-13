import type { Env } from '../_lib/env';
import { body, fail, json } from '../_lib/http';
import { rateLimit } from '../_lib/store';
import { generate } from '../_lib/gemini';
import { briefFacts, cleanBrief } from '../../src/lib/brief';
import type { Trip } from '../../src/types';

const SYSTEM =
  'You write pre-drive briefings for an Indian road trip planner. Plain, short, factual. ' +
  'Exactly 5 lines, one sentence each, no bullets, no markdown, no exclamation marks, no hype. ' +
  'Use only the facts given. Keep every number and time unchanged. Use km and 24-hour local time.';

// POST {trip} → {text}
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await rateLimit(env, request, 'brief'))) return fail(429, 'Too many requests. Try again in a minute.');
  const b = await body<{ trip?: Trip }>(request);
  const trip = b?.trip;
  if (!trip || !Array.isArray(trip.stints) || trip.stints.length > 100) return fail(400, 'Trip is required.');
  const facts = briefFacts(trip);
  const fallback = { text: facts.join('\n'), source: 'template' };
  if (!env.GEMINI_API_KEY) return json(fallback);
  try {
    const r = await generate(
      env,
      `Trip ${trip.origin?.label ?? ''} to ${trip.destination?.label ?? ''}. Rewrite these five facts as the briefing, same order, one line each:\n${facts.join('\n')}`,
      { system: SYSTEM, maxTokens: 250 },
    );
    const lines = cleanBrief(r.text);
    // guard: model must keep all numbers from the facts
    const nums = (s: string): string[] => s.match(/\d+/g) ?? [];
    const ok = lines.length === 5 && lines.every((l, i) => nums(facts[i]).every((n) => nums(l).includes(n)));
    return json(ok ? { text: lines.join('\n'), source: 'gemini' } : fallback);
  } catch {
    return json(fallback);
  }
};
