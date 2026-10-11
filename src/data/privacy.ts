/**
 * SD-152 — privacy rights: my status, "Download my data", guardian confirmation
 * and the linked guardian's controls over a child's account.
 * Server: migration 20261020120000_privacy_rights.sql + edge functions
 * guardian-consent and delete-account. Demo mode answers from the local store so
 * the screens can be explored offline (nothing is sent).
 */
import { Platform, Share } from 'react-native';
import { isSupabaseConfigured, supabase } from '../core/supabase';
import { fnPath } from '../core/functionPath';
import { downloadText } from '../core/download';
import { ageOf } from '../core/age';
import { analyticsChoice } from '../core/analyticsConsent';
import { privacyCountry } from '../core/privacyRegion';
import { getMyPlayerId, getPlayer } from './repos';
import { demo } from './demoStore';

const live = () => isSupabaseConfigured && !!supabase;

export type GuardianConsent = 'self_declared' | 'pending' | 'confirmed' | 'withdrawn' | null;

export interface PrivacyStatus {
  country: string | null;
  minor: boolean;
  guardianConsent: GuardianConsent;
  guardianConsentAt?: string | null;
  /** pending/withdrawn while under 18: no follows, no messages, hidden from strangers */
  limited: boolean;
  analyticsOptOut: boolean;
  guardianEmailHint?: string | null;
  pendingRequestSentAt?: string | null;
  /** player records an organiser created before you joined */
  addedBy: { playerId: string; addedAt: string; addedByName: string }[];
  guardianOf: number;
}

export interface GuardianChild {
  playerId: string;
  fullName: string;
  hasAccount: boolean;
  consent: GuardianConsent;
  limited: boolean;
  age?: number;
}

async function rpcError(error: unknown): Promise<string> {
  const m = (error as { message?: string } | null)?.message ?? '';
  return m || 'Something went wrong — check your connection and try again.';
}

/** Edge-function errors carry the real message in the response body. */
async function fnError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
  return (body as { error?: string; reason?: string } | null)?.error ?? (body as { reason?: string } | null)?.reason ?? fallback;
}

export async function getMyPrivacyStatus(): Promise<PrivacyStatus | null> {
  if (!live()) {
    return { country: privacyCountry(), minor: false, guardianConsent: null, limited: false,
      analyticsOptOut: analyticsChoice() === 'denied', addedBy: [], guardianOf: (await getGuardianChildren()).length };
  }
  const { data, error } = await supabase!.rpc('my_privacy_status');
  if (error || !data) return null;
  const d = data as PrivacyStatus;
  return { ...d, addedBy: d.addedBy ?? [], guardianOf: Number(d.guardianOf ?? 0) };
}

/* ------------------------------- export ------------------------------------ */

export type DataExport = Record<string, unknown> & { format: string; exportedAt: string };

async function demoExport(): Promise<DataExport> {
  const id = await getMyPlayerId('demo-user');
  const p = id ? await getPlayer(id) : null;
  return {
    format: 'sportnnote-export-v1', exportedAt: new Date().toISOString(), demo: true,
    account: { id: 'demo-user', full_name: 'Demo User' }, players: p ? [p] : [], statLines: [],
    messagesSent: [], follows: [], memberships: [], guardianOf: [],
    consents: { analyticsOptOut: analyticsChoice() === 'denied', log: [] },
  };
}

/** Everything we hold about me (JSON). */
export async function exportMyData(): Promise<DataExport> {
  if (!live()) return demoExport();
  const { data, error } = await supabase!.rpc('export_my_data');
  if (error) throw new Error(await rpcError(error));
  return data as DataExport;
}

/** Save/share an export as a .json file: a download on web, the share sheet on
 *  phones. Returns how it was handed over. */
export async function saveExport(data: DataExport, name = 'my-sportnnote-data'): Promise<'downloaded' | 'shared'> {
  const text = JSON.stringify(data, null, 2);
  const file = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
  if (downloadText(file, 'application/json', text)) return 'downloaded';
  await Share.share(Platform.OS === 'ios' ? { message: text } : { title: file, message: text });
  return 'shared';
}

/** Short human summary of an export, for the "View data" screens. */
export function exportSummary(x: DataExport): { label: string; value: string }[] {
  const n = (k: string) => (Array.isArray(x[k]) ? (x[k] as unknown[]).length : 0);
  const acct = (x.account ?? {}) as Record<string, unknown>;
  return [
    { label: 'Name', value: String(acct.full_name ?? '—') },
    { label: 'Date of birth', value: String(acct.dob ?? '—') },
    { label: 'Mobile', value: String(acct.phone ?? '—') },
    { label: 'Player profiles', value: String(n('players')) },
    { label: 'Stat lines (matches)', value: String(n('statLines')) },
    { label: 'Messages sent', value: String(n('messagesSent')) },
    { label: 'Following', value: String(n('follows')) },
    { label: 'Memberships', value: String(n('memberships')) },
  ];
}

/* ----------------------- guardian confirmation (email) --------------------- */

/** The child asks for (another) confirmation email to their guardian. */
export async function requestGuardianConsent(): Promise<{ sent: boolean; reason?: string; email?: string }> {
  if (!live()) return { sent: false, reason: 'Guardian emails need the live app.' };
  const { data, error } = await supabase!.functions.invoke(fnPath('guardian-consent'), { body: {} });
  if (error) return { sent: false, reason: await fnError(error, 'Couldn’t send the email just now — try again later.') };
  return data as { sent: boolean; reason?: string; email?: string };
}

export interface ConsentPreview { childFirstName: string; ageBand: string | null; status: GuardianConsent; expiresAt: string }

export async function previewGuardianConsent(code: string): Promise<ConsentPreview> {
  if (!live()) {
    if (code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === 'DEMO') return { childFirstName: 'Aarav', ageBand: '13 to 17', status: 'pending', expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() };
    throw new Error('That link or code isn’t valid or has expired. (Demo: use the code DEMO.)');
  }
  const { data, error } = await supabase!.rpc('guardian_consent_preview', { p_code: code });
  if (error) throw new Error(await rpcError(error));
  return data as ConsentPreview;
}

export async function decideGuardianConsent(code: string, approve: boolean, guardianName?: string): Promise<{ status: string; linked: boolean }> {
  if (!live()) return { status: approve ? 'confirmed' : 'withdrawn', linked: false };
  const { data, error } = await supabase!.rpc('guardian_consent_decide', { p_code: code, p_approve: approve, p_guardian_name: guardianName ?? null });
  if (error) throw new Error(await rpcError(error));
  return data as { status: string; linked: boolean };
}

/* ------------------------- linked guardian controls ------------------------ */

export async function getGuardianChildren(): Promise<GuardianChild[]> {
  if (!live()) {
    // Demo: the first under-18 demo player stands in for "your child".
    const kid = demo.players.find((p) => { const a = ageOf(p); return a !== undefined && a < 18; });
    return kid ? [{ playerId: kid.id, fullName: kid.fullName, hasAccount: true, consent: 'confirmed', limited: false, age: ageOf(kid) }] : [];
  }
  const { data, error } = await supabase!.rpc('guardian_children');
  if (error) return [];
  return ((data ?? []) as { player_id: string; full_name: string; has_account: boolean; consent: GuardianConsent; limited: boolean; age: number | null }[])
    .map((r) => ({ playerId: r.player_id, fullName: r.full_name, hasAccount: r.has_account, consent: r.consent, limited: r.limited, age: r.age ?? undefined }));
}

export async function guardianExportChild(playerId: string): Promise<DataExport> {
  if (!live()) {
    const p = await getPlayer(playerId);
    return { format: 'sportnnote-export-v1', exportedAt: new Date().toISOString(), demo: true, account: { full_name: p?.fullName, dob: p?.dob }, players: p ? [p] : [], statLines: [] };
  }
  const { data, error } = await supabase!.rpc('guardian_export_child', { p_player: playerId });
  if (error) throw new Error(await rpcError(error));
  return data as DataExport;
}

/** Confirm (true) or withdraw (false) consent for the child's account. */
export async function guardianSetConsent(playerId: string, confirm: boolean): Promise<GuardianConsent> {
  if (!live()) return confirm ? 'confirmed' : 'withdrawn';
  const { data, error } = await supabase!.rpc('guardian_set_consent', { p_player: playerId, p_confirm: confirm });
  if (error) throw new Error(await rpcError(error));
  return data as GuardianConsent;
}

/** Delete the child's account (or, with no account, their player record).
 *  Returns an error message, or null on success. */
export async function guardianDeleteChild(playerId: string): Promise<string | null> {
  if (!live()) return 'Deleting isn’t available in demo mode.';
  try {
    const { data, error } = await supabase!.functions.invoke(fnPath('delete-account'), { body: { confirm: 'DELETE', childPlayerId: playerId } });
    if (error) return fnError(error, 'Couldn’t delete just now — check your connection and try again.');
    return data?.deleted ? null : 'Couldn’t delete just now — please try again.';
  } catch {
    return 'Couldn’t delete just now — check your connection and try again.';
  }
}
