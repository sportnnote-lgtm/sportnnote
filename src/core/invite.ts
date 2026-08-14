/** Invite helpers — the single source of truth for the install link, the invite
 *  message, and the email channel. WhatsApp/SMS are opened via connect.ts
 *  (openWhatsApp/openSms); email goes through the send-invite edge function with
 *  a mailto fallback so it still works before that function is deployed. */
import { Linking } from 'react-native';
import { supabase } from './supabase';

/** Where invites point people to install + register. The deep-link
 *  `https://sportfolio.app/join/:token` (and `sportfolio://join/:token`) resolves
 *  to the Join screen — see RootNavigator linking config. */
export const APP_INSTALL_URL = 'https://sportfolio.app';
export const joinLink = (id: string) => `${APP_INSTALL_URL}/join/${id}`;

/** The invite message, shared across every channel (email / WhatsApp / SMS). */
export function inviteMessage(opts: { name: string; inviterName: string; link: string; context?: string }): string {
  const who = opts.name.trim() || 'there';
  const what = opts.context ? ` ${opts.context}` : '';
  return `Hi ${who}! ${opts.inviterName} invited you to co-host${what} on Sportfolio 🏆 Install the app and register with this number/email to join:\n${opts.link}`;
}

export const inviteSubject = (inviterName: string) => `${inviterName} invited you to co-host on Sportfolio`;

/**
 * Send an invite email. Tries the `send-invite` edge function (a real, sent
 * email); if it's unavailable/undeployed or reports not-delivered, falls back to
 * opening the device mail composer pre-filled (mailto). Returns true only when a
 * server email was actually sent.
 */
export async function sendInviteEmail(to: string, opts: { name: string; inviterName: string; link: string; context?: string }): Promise<boolean> {
  const subject = inviteSubject(opts.inviterName);
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
