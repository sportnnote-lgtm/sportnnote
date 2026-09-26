/** Invite helpers — the single source of truth for the install link, the invite
 *  message, and the email channel. WhatsApp/SMS are opened via connect.ts
 *  (openWhatsApp/openSms); email goes through the send-invite edge function with
 *  a mailto fallback so it still works before that function is deployed. */
import { Linking } from 'react-native';
import { supabase } from './supabase';

/** Marketing site (used only as a demo fallback for invite links). */
export const APP_INSTALL_URL = 'https://sportnnote.in';

/** The public invite/accept link for a provisional player. Served by the `join`
 *  edge function (a browser page that needs no app/account, on the reachable
 *  *.supabase.co domain) — NOT sportnnote.in/join, which is the GoDaddy marketing
 *  site and 404s. Association happens when the invitee installs + registers with the
 *  invited phone number (createMyPlayer claims the provisional row). Falls back to a
 *  deep link if the backend URL isn't configured (demo). */
export const joinLink = (id: string) => {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return base ? `${base}/functions/v1/join?p=${id}` : `${APP_INSTALL_URL}/join/${id}`;
};

/** The public "this isn't me" link for a provisional player — a browser page that
 *  needs no app/account (served by the `report-invite` edge function). Falls back
 *  to a deep link if the backend URL isn't configured (demo). */
export const reportLink = (playerId: string) => {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return base ? `${base}/functions/v1/report-invite?p=${playerId}` : `${APP_INSTALL_URL}/report/${playerId}`;
};

/** What someone is being invited to do — co-host an event (default) or manage a
 *  team's squad. Keeps the co-host wording untouched for existing callers. */
export type InviteRole = 'co-host' | 'manage';
const inviteVerb = (role?: InviteRole) => (role === 'manage' ? 'manage' : 'co-host');

/** The invite message, shared across every channel (email / WhatsApp / SMS). */
export function inviteMessage(opts: { name: string; inviterName: string; link: string; context?: string; role?: InviteRole; reportUrl?: string }): string {
  const who = opts.name.trim() || 'there';
  const what = opts.context ? ` ${opts.context}` : '';
  const base = `Hi ${who}! ${opts.inviterName} invited you to ${inviteVerb(opts.role)}${what} on SportnNote 🏆 Install the app and register with this number/email to join:\n${opts.link}`;
  return opts.reportUrl ? `${base}\n\nNot you / didn’t expect this? Tell us (no app needed): ${opts.reportUrl}` : base;
}

export const inviteSubject = (inviterName: string, role?: InviteRole) =>
  `${inviterName} invited you to ${role === 'manage' ? 'manage a team' : 'co-host'} on SportnNote`;

/**
 * Send an invite email. Tries the `send-invite` edge function (a real, sent
 * email); if it's unavailable/undeployed or reports not-delivered, falls back to
 * opening the device mail composer pre-filled (mailto). Returns true only when a
 * server email was actually sent.
 */
export async function sendInviteEmail(to: string, opts: { name: string; inviterName: string; link: string; context?: string; role?: InviteRole }): Promise<boolean> {
  const subject = inviteSubject(opts.inviterName, opts.role);
  const text = inviteMessage(opts);
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('send-invite', { body: { to, subject, text } });
      if (!error && (data as { delivered?: boolean } | null)?.delivered) return true;
    } catch {
      // fall through to mailto
    }
  }
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  void Linking.openURL(url);
  return false;
}
