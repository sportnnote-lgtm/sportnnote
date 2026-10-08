/** "📤 Invite again" — for anyone added by number who hasn't joined yet (squad
 *  player, scorer, host). The first invite can easily go unsent (WhatsApp closed
 *  before tapping send), so wherever a pending person appears this re-sends the
 *  same invite: WhatsApp / SMS to their number, or Share / Copy to send it any
 *  other way. Without a visible number, Share / Copy still works. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, Share } from 'react-native';
import { theme } from '../core/theme';
import { openWhatsApp, openSms } from '../core/connect';
import { provisionalInviteMessage } from '../core/invite';

export function RemindInstall({
  playerId, name, phone, teamName = 'the team', captain, message, label = '📤 Invite again',
}: {
  playerId: string;
  name: string;
  phone?: string;
  teamName?: string;
  captain?: boolean;
  /** a different invite text (e.g. scorer / host); default = the team-player invite */
  message?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const msg = message ?? provisionalInviteMessage({ name, playerId, teamName, captain });

  const share = async () => {
    setNote(null);
    const nav = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator : null;
    try {
      if (nav && typeof nav.share !== 'function') {
        await nav.clipboard.writeText(msg);
        setNote('Invite copied — paste it in any chat.');
        return;
      }
      await Share.share({ message: msg });
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      try { await nav?.clipboard.writeText(msg); setNote('Invite copied — paste it in any chat.'); } catch { setNote('Couldn’t share — try WhatsApp or SMS.'); }
    }
  };

  return (
    <View style={{ gap: theme.spacing(1) }}>
      {!open ? (
        <Text style={s.pill} accessibilityRole="button" accessibilityLabel={`Invite ${name} again`} onPress={() => setOpen(true)}>{label}</Text>
      ) : (
        <View style={s.row}>
          <Text style={s.label}>Send again:</Text>
          {phone ? <Text style={s.link} accessibilityRole="button" accessibilityLabel={`Invite ${name} on WhatsApp`} onPress={() => openWhatsApp(phone, msg)}>WhatsApp</Text> : null}
          {phone ? <Text style={s.link} accessibilityRole="button" accessibilityLabel={`Invite ${name} by SMS`} onPress={() => openSms(phone, msg)}>SMS</Text> : null}
          <Text style={s.link} accessibilityRole="button" accessibilityLabel={`Share ${name}'s invite`} onPress={() => void share()}>Share / Copy</Text>
          <Text style={s.close} accessibilityRole="button" accessibilityLabel="Close" onPress={() => { setOpen(false); setNote(null); }}>✕</Text>
        </View>
      )}
      {note ? <Text style={s.note}>{note}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(3) },
  pill: {
    alignSelf: 'flex-start', color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800',
    borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  close: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  note: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '700' },
});
