/**
 * Shared request guards for edge functions (migration 0025 hardening).
 *
 * The anon key ships inside the app, so the gateway's JWT check alone only proves
 * "someone has the app". These helpers add what each function actually needs:
 *   - requireUser:  a real signed-in user (rejects the bare anon key)
 *   - rateLimit:    a per-subject fixed-window cap (rate_limit_hit() ledger)
 *   - stripLinks:   removes URLs from free text we relay to other people
 *   - safeEqual:    constant-time secret comparison for webhooks / cron
 */
import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

/** Service-role client (bypasses RLS) — only for server-side lookups/writes. */
export const admin = createClient(SUPABASE_URL, SERVICE_KEY);

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export interface Caller {
  user: User;
  /** A client acting AS the caller (their JWT) — RLS + auth.uid() apply. */
  asUser: SupabaseClient;
}

/** The signed-in caller, or a 401 Response to return as-is. */
export async function requireUser(req: Request): Promise<Caller | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'sign in required' }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await asUser.auth.getUser(jwt);
  if (error || !data?.user) return json({ error: 'sign in required' }, 401);
  return { user: data.user, asUser };
}

/** Count one hit for `subject` in `bucket`; false once over `max` per window. Fails
 *  OPEN on a ledger error (a missing migration shouldn't take features down). */
export async function rateLimit(bucket: string, subject: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await admin.rpc('rate_limit_hit', {
    p_bucket: bucket, p_subject: subject, p_max: max, p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('rate_limit_hit failed', error.message);
    return true;
  }
  return data === true;
}

export const tooMany = () => json({ error: 'Too many requests — please try again later.' }, 429);

/** Remove links from text we relay to someone else (anti-phishing). */
export const stripLinks = (s: string) =>
  s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '').replace(/[ \t]{2,}/g, ' ').trim();

/** Clamp + tidy a free-text field. */
export const clip = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/** Constant-time string comparison (for shared secrets). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
