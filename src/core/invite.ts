/** Invite helpers — the single source of truth for the install link, the invite
 *  message, and the email channel. WhatsApp/SMS are opened via connect.ts
 *  (openWhatsApp/openSms); email goes through the send-invite edge function with
 *  a mailto fallback so it still works before that function is deployed. */
import { Linking } from 'react-native';
import { supabase } from './supabase';
import { SHARE_BASE } from './shareText';

/** Marketing site (used only as a demo fallback for invite links). */
export const APP_INSTALL_URL = 'https://sportnnote.in';

/** The invite/accept link for a provisional (added-by-number) player: the web
 *  app's invite page, where they sign up right there with the invited number and
 *  land in the team (sign-up claims the provisional row). Old messages used the
 *  `join` edge function, which now redirects here. */
export const joinLink = (id: string) => `${SHARE_BASE}/i/${id}`;

/** A CLUB invite opens the web app's Join screen (a guest is asked to sign up
 *  first, then comes straight back to it). */
export const clubJoinLink = (token: string) => `${SHARE_BASE}/join-club/${token}`;
/** The in-app deep link that opens the redeem screen straight away once installed. */
export const clubJoinDeepLink = (token: string) => `sportnnote://join-club/${token}`;

/** Extract a club invite code from a scanned/typed value — accepts the deep link
 *  (sportnnote://join-club/CODE), the https landing link (…/join-club?c=CODE or
 *  …/join-club/CODE), or a bare code. Returns the upper-cased code, or null. */
export function parseClubToken(scanned: string): string | null {
  const s = scanned.trim();
  if (!s) return null;
  // ?c=CODE query form
  const q = s.match(/[?&]c=([A-Za-z0-9-]{3,40})/);
  if (q) return q[1].toUpperCase();
  // …/join-club/CODE path form (deep link or https)
  const p = s.match(/join-club\/([A-Za-z0-9-]{3,40})/i);
  if (p) return p[1].toUpperCase();
  // a bare code
  if (/^[A-Za-z0-9-]{3,40}$/.test(s)) return s.toUpperCase();
  return null;
}

/** The message shared to invite someone to a club (team). Carries the code + links. */
export function clubInviteMessage(opts: { clubName: string; inviterName: string; token: string }): string {
  return `Join ${opts.clubName} on SportnNote! ${opts.inviterName} invited you 🛡️\n\nOpen this to join: ${clubJoinLink(opts.token)}\n\nOr in the app, go to Join a team and enter code: ${opts.token}`;
}

/** "This isn't me" for a provisional player: the same invite page, opened on its
 *  "Not you?" confirm step (no app/account needed). Opening it records nothing. */
export const reportLink = (playerId: string) => `${SHARE_BASE}/i/${playerId}?notme=1`;

/** "Invited (…1234)" is a placeholder until the person joins — never greet it. */
export const realName = (name?: string) => (name && !/^Invited \(/.test(name.trim()) ? name.trim() : '');

/** The install/join message for a provisional (added-by-phone) player — shared by
 *  every "invite / remind to install" affordance so the wording + links stay
 *  identical across the app (match add screen, team squad, etc.). */
export function provisionalInviteMessage(opts: { name: string; playerId: string; teamName: string; captain?: boolean }): string {
  const who = realName(opts.name) || 'there';
  const link = joinLink(opts.playerId);
  const report = reportLink(opts.playerId);
  return opts.captain
    ? `Hi ${who}! You're the captain of ${opts.teamName} on SportnNote 🧢\n\nTap the link and sign up with this mobile number (1 minute, no password) to confirm your spot, add your teammates and set the squad:\n${link}\n\nNot you / didn't expect this? Tell us (no app needed): ${report}`
    : `Hi ${who}! You've been added to ${opts.teamName} on SportnNote 🏆\n\nTap the link and sign up with this mobile number (1 minute, no password) to confirm your spot and track your stats:\n${link}\n\nNot you / didn't expect this? Tell us (no app needed): ${report}`;
}

/** What someone is being invited to do — co-host an event (default) or manage a
 *  team's squad. Keeps the co-host wording untouched for existing callers. */
export type InviteRole = 'co-host' | 'manage';
const inviteVerb = (role?: InviteRole) => (role === 'manage' ? 'manage' : 'co-host');

/** The invite message, shared across every channel (email / WhatsApp / SMS). */
export function inviteMessage(opts: { name: string; inviterName: string; link: string; context?: string; role?: InviteRole; reportUrl?: string }): string {
  const who = realName(opts.name) || 'there';
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
      // The server composes the email from a fixed template (so the function can't
      // be used to send arbitrary text from our domain); we send only the parts.
      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: { to, name: opts.name, link: opts.link, context: opts.context ?? '', role: opts.role ?? 'co-host' },
      });
      if (!error && (data as { delivered?: boolean } | null)?.delivered) return true;
    } catch {
      // fall through to mailto
    }
  }
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  void Linking.openURL(url);
  return false;
}
