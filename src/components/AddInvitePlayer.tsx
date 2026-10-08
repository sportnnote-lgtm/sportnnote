/** Add or invite a player to a team — THE way people get onto a team, everywhere
 *  (live match, matchday squad, team squad page). One box: mobile number, name or
 *  email, or pick straight from the phone's contacts.
 *   • Someone already on SportnNote shows up (exact number / email, or by name) —
 *     one tap adds the real person.
 *   • A NEW person can only be added by mobile number (their identity — no
 *     made-up names): we add them as "invited" and open a WhatsApp/SMS invite;
 *     they're confirmed when they register with that number.
 *  `fixedSide` locks it to one team (no Home/Away toggle). */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, TextField, Button, textStyles } from './ui';
import { invitePlayer, markPlayerRegistered, findPlayerByPhone, findPlayerByEmail, lookupPeople, getReportedPlayerIds, removePlayerFromTeam } from '../data/repos';
import { looksLikeContact } from '../core/contactQuery';
import { canPickContact, pickContact, canPaste, pasteText } from '../core/pickContact';
import { notify } from '../core/notifications';
import { openWhatsApp, openSms } from '../core/connect';
import { provisionalInviteMessage, realName } from '../core/invite';
import { isValidPhone } from '../core/phone';
import { reportError } from '../core/telemetry';
import type { Player, SportId } from '../core/types';
import { RemindInstall } from './RemindInstall';

/** Up to two initials from a name, for an invited-player avatar. */
const initials = (name?: string): string =>
  (name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export function AddInvitePlayer({
  homeTeamId, awayTeamId, homeTeamName, awayTeamName, sport, invited, onChanged, fixedSide, title, matchId, defaultOpen = false, existingIds = [],
}: {
  homeTeamId: string; awayTeamId: string;
  homeTeamName?: string; awayTeamName?: string;
  sport: SportId; invited: Player[]; onChanged: () => void;
  // When embedded on a single team's squad card, lock to that side (no toggle).
  fixedSide?: 'home' | 'away'; title?: string;
  // The match this add happens in — enables the "one person, one team" conflict check.
  matchId?: string;
  /** start expanded (e.g. a team page whose whole job is adding players) */
  defaultOpen?: boolean;
  /** players already on the team — not offered again */
  existingIds?: string[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [jersey, setJersey] = useState('');
  const [people, setPeople] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [side, setSide] = useState<'home' | 'away'>(fixedSide ?? 'home');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [matched, setMatched] = useState<Player | null>(null);
  const [matchedReported, setMatchedReported] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The last new-player invite, so it can be re-sent via WhatsApp OR SMS.
  const [lastInvite, setLastInvite] = useState<{ phone: string; msg: string } | null>(null);

  const teamId = side === 'home' ? homeTeamId : awayTeamId;
  const teamName = (side === 'home' ? homeTeamName : awayTeamName) ?? 'the team';
  // `phone` holds whatever is typed: a number, a name or an email.
  const kind = looksLikeContact(phone);
  const valid = kind === 'phone' && isValidPhone(phone);
  const isEmail = kind === 'email';
  const isName = !kind && phone.trim().length >= 2 && !/^[+\d\s()-]+$/.test(phone.trim());

  // Which team an invited player actually belongs to (by the team they were added
  // under), so Remove targets the right side even when this form's toggle is on the
  // other team. Falls back to the selected side.
  const teamIdForPlayer = (p: Player) =>
    p.houseName && p.houseName === homeTeamName ? homeTeamId
    : p.houseName && p.houseName === awayTeamName ? awayTeamId
    : teamId;

  // Invite text for a pending player (used for the initial send + any resend).
  const inviteMsg = (playerId: string, playerName: string, captain: boolean) =>
    provisionalInviteMessage({ name: playerName, playerId, teamName, captain });

  // The number is the identity — recognise it first and pull up the known name.
  useEffect(() => {
    if (!valid && !isEmail) { setMatched(null); setMatchedReported(false); setLooking(false); return; }
    let on = true; setLooking(true);
    (valid ? findPlayerByPhone(phone) : findPlayerByEmail(phone.trim())).then(async (p) => {
      if (!on) return;
      setLooking(false); setMatched(p);
      if (p) setName(p.fullName); // one number ⇒ one name — never let a duplicate be typed
      else if (isEmail) setName('');
      // Was this number reported as "not me"? Block re-adding until it's cleared.
      setMatchedReported(p ? (await getReportedPlayerIds([p.id])).has(p.id) : false);
    }).catch((e) => {
      // Lookup failed (offline / rate limit): don't hang on "checking" — treat the
      // number as new; the server still links it to the right person on save.
      if (!on) return;
      setLooking(false); setMatched(null);
      reportError(e);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, valid, isEmail]);

  // Typing a name → members with that name (pick the real person, never retype them).
  useEffect(() => {
    if (!isName) { setPeople([]); setSearching(false); return; }
    let on = true; setSearching(true);
    const t = setTimeout(() => {
      lookupPeople(phone).then((list) => { if (on) setPeople(list.filter((p) => !existingIds.includes(p.id)).slice(0, 6)); })
        .catch(() => { if (on) setPeople([]); })
        .finally(() => { if (on) setSearching(false); });
    }, 300);
    return () => { on = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, isName]);

  const fromContacts = async () => {
    setNote(null);
    try {
      const c = await pickContact();
      if (!c) return;
      const num = c.phones.find((n) => isValidPhone(n)) ?? c.phones[0];
      if (!num) { setNote('That contact has no mobile number.'); return; }
      setPhone(num.trim()); setName(c.name ?? '');
    } catch (e) {
      reportError(e);
      setNote(Platform.OS === 'web' ? 'Couldn’t open your contacts — paste or type the number instead.' : 'Couldn’t open your contacts — allow SportnNote to access them in Settings, or type the number.');
    }
  };
  const paste = async () => {
    try { const t = await pasteText(); if (t) setPhone(t); } catch { setNote('Couldn’t read the clipboard — long-press the box and choose Paste.'); }
  };

  // Flag any pending invitees who reported "this isn't me".
  useEffect(() => {
    let on = true;
    const ids = invited.map((p) => p.id);
    if (!ids.length) { setReportedIds(new Set()); return; }
    getReportedPlayerIds(ids).then((s) => { if (on) setReportedIds(s); });
    return () => { on = false; };
  }, [invited]);

  const submit = async (pick?: Player) => {
    const person = pick ?? matched ?? undefined;
    if (busy || (!person && !valid)) return;
    if (!pick && matchedReported) { setNote('⚠ This person reported that this number isn’t them — they can’t be added.'); return; }
    setBusy(true); setNote(null);
    try {
      const res = await invitePlayer({
        teamId, teamName, sport, matchId,
        name: (person?.fullName ?? name).trim(),
        player: person, phone: person ? undefined : phone,
        jerseyNo: !person && jersey ? Number(jersey) : undefined,
      });
      const cap = res.madeCaptain;
      // First player on a captain-less team becomes captain — tell them in-app so
      // they can build the rest of the squad themselves.
      if (cap) {
        void notify({
          title: `🧢 You're captain of ${teamName}`,
          body: `You've been made captain of ${teamName} on SportnNote — add your teammates and set the matchday squad.`,
          playerId: res.player.id,
        });
      }
      if (res.status === 'existing') {
        setNote(`✓ Added ${res.player.fullName}${cap ? ' as captain' : ''} — already on SportnNote.`);
        setLastInvite(null);
      } else {
        const msg = inviteMsg(res.player.id, res.player.fullName, !!cap);
        openWhatsApp(phone, msg);
        setLastInvite({ phone, msg }); // keep it so they can also send by SMS
        setNote(`⏳ Invited ${realName(res.player.fullName) || 'them'}${cap ? ' as captain' : ''} — WhatsApp opened. Didn’t send it? Use WhatsApp / SMS below, or “📤 Invite again” next to their name any time. They’re confirmed once they sign up.`);
      }
      setPhone(''); setName(''); setJersey(''); setMatched(null); setPeople([]);
      onChanged();
    } catch (e) {
      // Surfaces the "already on another team" conflict message, or a generic fallback.
      setNote(e instanceof Error && e.message ? `⚠ ${e.message}` : 'Could not add the player. Check the number and try again.');
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

          {/* One box: number (the identity), name or email — or straight from contacts. */}
          <TextField label="Mobile number, name or email" value={phone} onChange={(v) => { setPhone(v); setNote(null); }} placeholder="98765 43210" autoCapitalize="none" />
          {(canPickContact() || canPaste()) && (
            <View style={st.sourceRow}>
              {canPickContact() && <Text style={st.sourceBtn} accessibilityRole="button" onPress={() => void fromContacts()}>📇 Choose from contacts</Text>}
              {!canPickContact() && canPaste() && <Text style={st.sourceBtn} accessibilityRole="button" onPress={() => void paste()}>📋 Paste number</Text>}
            </View>
          )}

          {!phone.trim() ? (
            <Text style={textStyles.muted}>New players are added by their mobile number — that’s how we know a real person (one number, one profile). Players already on SportnNote show up as you type.</Text>
          ) : isName ? (
            <>
              {people.map((p) => (
                <TouchableOpacity key={p.id} accessibilityRole="button" style={st.personRow} activeOpacity={0.8} onPress={() => void submit(p)} disabled={busy}>
                  <Text style={st.personName} numberOfLines={1}>{p.fullName}{p.city ? ` · ${p.city}` : ''}{p.invited ? ' · invited' : ''}</Text>
                  <Text style={st.personAdd}>＋ Add</Text>
                </TouchableOpacity>
              ))}
              {!searching && people.length === 0 && <Text style={textStyles.muted}>No one on SportnNote by that name. Add them with their mobile number{canPickContact() ? ' or from your contacts' : ''}.</Text>}
            </>
          ) : !valid && !isEmail ? (
            <Text style={textStyles.muted}>Enter the full 10-digit mobile number.</Text>
          ) : looking ? (
            <Text style={textStyles.muted}>{isEmail ? 'Checking this email…' : 'Checking this number…'}</Text>
          ) : matched && matchedReported ? (
            <Text style={st.reportedNote}>⚠ {matched.fullName} reported this number isn’t them — they can’t be added.</Text>
          ) : matched ? (
            existingIds.includes(matched.id)
              ? <Text style={textStyles.muted}>{matched.fullName} is already in {teamName}.</Text>
              : matched.invited
                ? <Text style={st.matchedNote}>⏳ Invited earlier — hasn’t joined yet. Add them to {teamName} too.</Text>
                : <Text style={st.matchedNote}>✓ {matched.fullName} — already on SportnNote.</Text>
          ) : isEmail ? (
            <Text style={textStyles.muted}>No one on SportnNote with that email. Add new players by their mobile number.</Text>
          ) : (
            <>
              <Text style={textStyles.body}>Not on SportnNote yet — add them and send an invite:</Text>
              <View style={st.newRow}>
                <View style={{ flex: 3 }}><TextField label="Name (optional)" value={name} onChange={setName} placeholder="They’ll confirm it when they join" /></View>
                <View style={{ flex: 1 }}><TextField label="Jersey" value={jersey} onChange={(t) => setJersey(t.replace(/[^0-9]/g, '').slice(0, 3))} placeholder="#" autoCapitalize="none" /></View>
              </View>
            </>
          )}

          {(valid || (isEmail && matched)) && !looking && !(matched && (matchedReported || existingIds.includes(matched.id))) && (
            <Button
              label={busy ? 'Adding…' : matched ? `＋ Add ${realName(matched.fullName) || 'them'} to ${teamName}` : '＋ Add & invite (WhatsApp / SMS)'}
              onPress={() => void submit()}
              disabled={busy}
            />
          )}
          {note && <Text style={st.inviteNote}>{note}</Text>}
          {lastInvite && (
            <View style={st.sendRow}>
              <Text style={st.sendVia}>Send invite via:</Text>
              <Text style={st.sendLink} accessibilityRole="button" onPress={() => openWhatsApp(lastInvite.phone, lastInvite.msg)}>WhatsApp</Text>
              <Text style={st.sendLink} accessibilityRole="button" onPress={() => openSms(lastInvite.phone, lastInvite.msg)}>SMS</Text>
            </View>
          )}

          {invited.length > 0 && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={st.invitedLabel}>Invited · {invited.length} pending registration</Text>
              {invited.map((p) => (
                <View key={p.id} style={st.invitedRow}>
                  <View style={st.invAvatar}><Text style={st.invAvatarText}>{initials(p.fullName)}</Text></View>
                  <View style={{ flex: 1, gap: theme.spacing(1) }}>
                    <Text style={st.invitedName} numberOfLines={1}>{p.fullName}</Text>
                    {reportedIds.has(p.id)
                      ? <Text style={st.reportedRowNote} numberOfLines={1}>⚠ reported this isn’t them</Text>
                      : <>
                          {p.phone ? <Text style={st.invitedPhone} numberOfLines={1}>{p.phone}</Text> : null}
                          <RemindInstall playerId={p.id} name={p.fullName} phone={p.phone} teamName={(p.houseName === awayTeamName ? awayTeamName : homeTeamName) ?? teamName} />
                        </>}
                  </View>
                  {reportedIds.has(p.id) ? (
                    <View style={st.reportedTag}><Text style={st.reportedTagText}>REPORTED</Text></View>
                  ) : (
                    <>
                      <Text style={st.registeredLink} onPress={() => registered(p.id)}>Mark registered</Text>
                      <Text style={st.removeLink} accessibilityRole="button" accessibilityLabel={`Remove ${p.fullName}`} onPress={async () => { await removePlayerFromTeam(teamIdForPlayer(p), p.id, matchId); onChanged(); }}>Remove</Text>
                    </>
                  )}
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
  sourceRow: { flexDirection: 'row', gap: theme.spacing(3), marginTop: -theme.spacing(1) },
  sourceBtn: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800', paddingVertical: theme.spacing(1) },
  newRow: { flexDirection: 'row', gap: theme.spacing(3) },
  personRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  personName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', flex: 1 },
  personAdd: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  inviteNote: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '600' },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  sendVia: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  sendLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  resendLink: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '800' },
  matchedNote: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  reportedNote: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  reportedRowNote: { color: theme.colors.danger, fontSize: theme.font.tiny, fontWeight: '700' },
  reportedTag: { paddingVertical: 2, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.danger },
  reportedTagText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  invitedLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  invitedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  invAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  invAvatarText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900' },
  invitedName: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  invitedPhone: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  pendingTag: { paddingVertical: 2, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.accent },
  pendingTagText: { color: '#0B0F14', fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  registeredLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  removeLink: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
});
