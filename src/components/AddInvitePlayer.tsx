/** Add or invite a player to a team by mobile number — the phone is the identity,
 *  so a known number pulls up the existing person and a new number opens a WhatsApp
 *  invite-to-install (they show "invited/pending" until they register). Used both on
 *  the live-scoring screen (two teams, with a Home/Away toggle) and on the matchday
 *  squad picker (one team, `fixedSide` locks the toggle away). Adds persist to the
 *  team's saved squad. */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, TextField, Button, textStyles } from './ui';
import { invitePlayer, markPlayerRegistered, findPlayerByPhone } from '../data/repos';
import { openWhatsApp } from '../core/connect';
import { isValidPhone } from '../core/phone';
import type { Player, SportId } from '../core/types';

/** Up to two initials from a name, for an invited-player avatar. */
const initials = (name?: string): string =>
  (name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export function AddInvitePlayer({
  homeTeamId, awayTeamId, homeTeamName, awayTeamName, sport, invited, onChanged, fixedSide, title,
}: {
  homeTeamId: string; awayTeamId: string;
  homeTeamName?: string; awayTeamName?: string;
  sport: SportId; invited: Player[]; onChanged: () => void;
  // When embedded on a single team's squad card, lock to that side (no toggle).
  fixedSide?: 'home' | 'away'; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'home' | 'away'>(fixedSide ?? 'home');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [matched, setMatched] = useState<Player | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const teamId = side === 'home' ? homeTeamId : awayTeamId;
  const teamName = (side === 'home' ? homeTeamName : awayTeamName) ?? 'the team';
  const valid = isValidPhone(phone);

  // The number is the identity — recognise it first and pull up the known name.
  useEffect(() => {
    if (!valid) { setMatched(null); setLooking(false); return; }
    let on = true; setLooking(true);
    findPlayerByPhone(phone).then((p) => {
      if (!on) return;
      setLooking(false); setMatched(p);
      if (p) setName(p.fullName); // one number ⇒ one name — never let a duplicate be typed
    });
    return () => { on = false; };
  }, [phone, valid]);

  const submit = async () => {
    if (!valid || busy) return;
    if (!matched && !name.trim()) { setNote('Enter the player’s name.'); return; }
    setBusy(true); setNote(null);
    try {
      const res = await invitePlayer({ teamId, teamName, name: (matched?.fullName ?? name).trim(), phone, sport });
      if (res.status === 'existing') {
        setNote(`✓ Added ${res.player.fullName} — already on Sportfolio.`);
      } else {
        const link = `https://sportfolio.app/join/${res.player.id}`;
        openWhatsApp(phone, `Hi ${res.player.fullName}! You've been added to ${teamName} on Sportfolio 🏆 Install the app and register with this number to confirm your spot and track your stats:\n${link}`);
        setNote(`⏳ Invited ${res.player.fullName} — WhatsApp opened. They're confirmed once they register.`);
      }
      setPhone(''); setName(''); setMatched(null);
      onChanged();
    } catch {
      setNote('Could not add the player. Check the number and try again.');
    } finally {
      setBusy(false);
    }
  };

  const registered = async (id: string) => { await markPlayerRegistered(id); onChanged(); };

  return (
    <View style={st.inviteCard}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={title ?? 'Add or invite a player'} accessibilityState={{ expanded: open }} activeOpacity={0.8} style={st.inviteHead} onPress={() => setOpen((o) => !o)}>
        <Text style={st.inviteTitle}>{title ?? '＋ Add / invite a player'}</Text>
        <View style={st.headRight}>
          {invited.length > 0 ? <View style={st.pendingCount}><Text style={st.pendingCountText}>{invited.length} pending</Text></View> : null}
          <Text style={st.caretMuted}>{open ? '▴' : '▾'}</Text>
        </View>
      </TouchableOpacity>
      {open && (
        <View style={{ gap: theme.spacing(3) }}>
          {!fixedSide && (
            <View style={st.sideRow}>
              <SelectChip label={homeTeamName ?? 'Home'} active={side === 'home'} onPress={() => setSide('home')} />
              <SelectChip label={awayTeamName ?? 'Away'} active={side === 'away'} onPress={() => setSide('away')} />
            </View>
          )}

          {/* Number first — the primary identity. */}
          <TextField label="Mobile number" value={phone} onChange={setPhone} placeholder="+91 98765 43210" autoCapitalize="none" />

          {!valid ? (
            <Text style={textStyles.muted}>Enter a mobile number to add or invite a player. The number is how we recognise a person — one number, one profile.</Text>
          ) : looking ? (
            <Text style={textStyles.muted}>Checking this number…</Text>
          ) : matched ? (
            <Text style={st.matchedNote}>✓ {matched.fullName} — already on Sportfolio. Adding them to {teamName}.</Text>
          ) : (
            <>
              <TextField label="Player name" value={name} onChange={setName} placeholder="e.g. Rahul Sharma" />
              <Text style={textStyles.muted}>New number → we open a WhatsApp invite so they install &amp; register. They show as “invited” until they do.</Text>
            </>
          )}

          <Button
            label={busy ? 'Adding…' : matched ? `＋ Add ${matched.fullName}` : '＋ Add & send WhatsApp invite'}
            onPress={submit}
            disabled={busy || !valid || (!matched && !name.trim())}
          />
          {note && <Text style={st.inviteNote}>{note}</Text>}

          {invited.length > 0 && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={st.invitedLabel}>Invited · {invited.length} pending registration</Text>
              {invited.map((p) => (
                <View key={p.id} style={st.invitedRow}>
                  <View style={st.invAvatar}><Text style={st.invAvatarText}>{initials(p.fullName)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.invitedName} numberOfLines={1}>{p.fullName}</Text>
                    {p.phone ? <Text style={st.invitedPhone} numberOfLines={1}>{p.phone}</Text> : null}
                  </View>
                  <View style={st.pendingTag}><Text style={st.pendingTagText}>PENDING</Text></View>
                  <Text style={st.registeredLink} onPress={() => registered(p.id)}>Mark registered</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  inviteCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(3) },
  inviteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  pendingCount: { paddingVertical: 2, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.accent },
  pendingCountText: { color: '#0B0F14', fontSize: theme.font.tiny, fontWeight: '900' },
  caretMuted: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800' },
  sideRow: { flexDirection: 'row', gap: theme.spacing(2) },
  inviteNote: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '600' },
  matchedNote: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  invitedLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  invitedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  invAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  invAvatarText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900' },
  invitedName: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  invitedPhone: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  pendingTag: { paddingVertical: 2, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.accent },
  pendingTagText: { color: '#0B0F14', fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  registeredLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
