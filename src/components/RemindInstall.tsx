/** A small, reusable "remind to install" control for a player who was added by
 *  phone but hasn't registered yet. Shows WhatsApp + SMS quick-send links that open
 *  the invite pre-filled — so anyone can re-share the app install link from wherever
 *  the player appears (team squad, match add, etc.). Renders nothing without a phone. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { openWhatsApp, openSms } from '../core/connect';
import { provisionalInviteMessage } from '../core/invite';

export function RemindInstall({
  playerId, name, phone, teamName, captain, label = 'Remind to install:',
}: {
  playerId: string;
  name: string;
  phone?: string;
  teamName: string;
  captain?: boolean;
  label?: string;
}) {
  if (!phone) return null;
  const msg = provisionalInviteMessage({ name, playerId, teamName, captain });
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.link} accessibilityRole="button" accessibilityLabel={`Remind ${name} on WhatsApp`} onPress={() => openWhatsApp(phone, msg)}>WhatsApp</Text>
      <Text style={s.link} accessibilityRole="button" accessibilityLabel={`Remind ${name} by SMS`} onPress={() => openSms(phone, msg)}>SMS</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(3) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
