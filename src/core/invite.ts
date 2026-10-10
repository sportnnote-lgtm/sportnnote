/** Invite helpers — the single source of truth for the install link, the invite
 *  message, and the email channel. WhatsApp/SMS are opened via connect.ts
 *  (openWhatsApp/openSms); email goes through the send-invite edge function with
 *  a mailto fallback so it still works before that function is deployed. */
import { Linking } from 'react-native';
import { supabase } from './supabase';

/** Marketing site (used only as a demo fallback for invite links). */
export const APP_INSTALL_URL = 'https://sportnnote.in';

export {
  joinLink, reportLink, clubJoinLink, clubJoinDeepLink, parseClubToken, realName,
  clubInviteMessage, provisionalInviteMessage, inviteMessage, inviteSubject, inviteLabel, teamAtTournament,
} from './inviteText';
export type { InviteRole } from './inviteText';
import { inviteMessage, inviteSubject, type InviteRole } from './inviteText';

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
