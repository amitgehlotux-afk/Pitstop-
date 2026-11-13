export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function fail(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return json({ error, ...extra }, status);
}

export async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const UA = 'Pitstop/1.0 (+https://pitstop.amitgehlot.com)';

export function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function validLatLng(p: unknown): p is { lat: number; lng: number } {
  const o = p as { lat?: unknown; lng?: unknown } | null;
  return !!o && isNum(o.lat) && isNum(o.lng) && Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180;
}

export async function sha(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
