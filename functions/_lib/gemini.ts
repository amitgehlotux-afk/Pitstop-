import type { Env } from './env';

export interface GeminiResult {
  text: string;
  sources: { title: string; uri: string }[];
  widgetToken?: string;
}

interface GroundingChunk {
  maps?: { uri?: string; title?: string; placeId?: string };
  web?: { uri?: string; title?: string };
}

/**
 * Calls Gemini generateContent. With `maps`, enables the Grounding with Google Maps tool and
 * biases retrieval to the given location. Model comes from env GEMINI_MODEL (check the Gemini
 * docs for models that support Maps grounding).
 */
export async function generate(
  env: Env,
  prompt: string,
  opts: { maps?: { lat: number; lng: number }; system?: string; maxTokens?: number } = {},
): Promise<GeminiResult> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  const model = env.GEMINI_MODEL || 'gemini-flash-latest';
  const payload: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: opts.maxTokens ?? 400 },
  };
  if (opts.system) payload.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.maps) {
    payload.tools = [{ googleMaps: {} }];
    payload.toolConfig = {
      retrievalConfig: { latLng: { latitude: opts.maps.lat, longitude: opts.maps.lng } },
    };
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: { groundingChunks?: GroundingChunk[]; googleMapsWidgetContextToken?: string };
    }[];
  };
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  const seen = new Set<string>();
  const sources: { title: string; uri: string }[] = [];
  for (const c of cand?.groundingMetadata?.groundingChunks ?? []) {
    const s = c.maps ?? c.web;
    if (!s?.uri || seen.has(s.uri)) continue;
    // only accept https links
    if (!/^https:\/\//.test(s.uri)) continue;
    seen.add(s.uri);
    sources.push({ title: s.title || 'Google Maps', uri: s.uri });
  }
  return { text, sources, widgetToken: cand?.groundingMetadata?.googleMapsWidgetContextToken };
}
