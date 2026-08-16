/** Tournament participants — the roster an organizer registers up front, before
 *  deciding a format. "How many teams are in?" is the first thing you need to
 *  split into groups or size a bracket, and until now a tournament had no team
 *  list (participation was only implied by its matches). Pick from the sport's
 *  teams (or add a new one), then Save. The count drives the format planner and
 *  the auto-fixtures team picker defaults to whatever's registered here.
 *
 *  Adding a team the real-event way: most teams aren't on the app yet, so the
 *  organizer enters them — and a team is a real entity, not an orphan shell. A
 *  new team is attributed to the hosting community, and you can capture a
 *  manager/captain contact who gets invited to claim the team & manage its
 *  squad (a team-claim invite → join link, sent by email / WhatsApp / SMS). */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, ScreenTitle, FormError, textStyles } from '../components/ui';
import { getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import { useTournamentById, useTeams, useTournamentTeams, useLeagueData } from '../data/hooks';
import { addTournamentTeams, removeTournamentTeam, createTeam, invitePerson, setTeamLeaders, createInvite } from '../data/repos';
import { sendInviteEmail, joinLink, inviteMessage } from '../core/invite';
import { openWhatsApp, openSms } from '../core/connect';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const PALETTE = ['#FF5C5C', '#4DA3FF', '#3DDC97', '#FFB454', '#B98AFF', '#FF8AC4'];

export default function TournamentTeamsScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TournamentTeams'>>();
  const { profile } = useAuth();
  const tournament = useTournamentById(params.tournamentId);
  const tourSports = tournament?.sports ?? [];
  const inviterName = profile?.fullName ?? 'The organizer';

  const [sport, setSport] = useState<SportId>(params.sport ?? tourSports[0] ?? 'football');
  const [tick, setTick] = useState(0); // bump to refetch teams / registrations after a write
  const allTeams = useTeams(sport, tick);
  const registered = useTournamentTeams(params.tournamentId, sport, tick);
  const { matches } = useLeagueData(params.tournamentId);

  const [selected, setSelected] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inline "add a team" mini-form.
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [adding, setAdding] = useState(false);
  // Optional team manager/captain captured while adding — attributes the team to
  // a real person and invites them to claim it & manage the squad.
  const [mgrOpen, setMgrOpen] = useState(false);
  const [mgrName, setMgrName] = useState('');
  const [mgrPhone, setMgrPhone] = useState('');
  const [mgrEmail, setMgrEmail] = useState('');
  // Confirmation shown after a team is added (with an optional share-invite CTA).
  const [added, setAdded] = useState<{ note: string; link?: string; phone?: string; name?: string; context?: string } | null>(null);

  // Seed the selection from what's registered — but only until the user edits it,
  // so a background refetch doesn't clobber in-progress changes.
  useEffect(() => {
    if (dirty) return;
    const ids = registered.map((t) => t.id);
    setSelected(ids);
    setOriginal(ids);
  }, [registered, dirty]);

  // Keep the sport valid on multi-sport meets.
  useEffect(() => {
    if (tourSports.length && !tourSports.includes(sport)) setSport(tourSports[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  const pickSport = (s: SportId) => { setSport(s); setDirty(false); };
  const toggle = (id: string) => {
    setDirty(true);
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  // Teams already appearing in this tournament's fixtures that aren't registered
  // yet — a one-tap way to backfill participants for a tournament with matches.
  const inFixtures = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matches) if (m.sport === sport) { ids.add(m.homeTeam.id); ids.add(m.awayTeam.id); }
    return [...ids].filter((id) => allTeams.some((t) => t.id === id));
  }, [matches, sport, allTeams]);
  const unregisteredInFixtures = inFixtures.filter((id) => !selected.includes(id));

  async function addNewTeam() {
    if (!name.trim() || !short.trim()) return setError('Name and short code are required.');
    setError(null); setBusy(true); setAdded(null);
    try {
      // Attribute the team to the hosting community, when there is one, so it
      // isn't an orphan shell.
      const t = await createTeam({
        name: name.trim(),
        shortName: short.trim().toUpperCase(),
        sport,
        colorHex: color,
        orgId: tournament?.hostOrgId,
      });

      // If a manager/captain contact was given, tie a real person to the team and
      // invite them to claim it + manage the squad (team-claim invite → join link).
      const mName = mgrName.trim();
      const mPhone = mgrPhone.trim();
      const mEmail = mgrEmail.trim();
      const context = `${t.name}${tournament ? ` at ${tournament.name}` : ''}`;
      if (mName || mPhone || mEmail) {
        const { player } = await invitePerson({ name: mName || t.name, phone: mPhone || undefined, email: mEmail || undefined });
        await setTeamLeaders(t.id, { captainId: player.id });
        const invite = await createInvite(t.id, t.name, 'captain');
        const link = joinLink(invite.token);
        if (mEmail) {
          const sent = await sendInviteEmail(mEmail, { name: player.fullName, inviterName, link, context, role: 'manage' });
          setAdded({ note: sent ? `✅ ${t.name} added · invite emailed to ${player.fullName}.` : `✅ ${t.name} added · couldn’t email — share this link with ${player.fullName}: ${link}` });
        } else {
          // No email: offer WhatsApp/SMS (opens the app) and show the link to share.
          setAdded({ note: `✅ ${t.name} added · invite ${player.fullName} to manage the squad:`, link, phone: mPhone || undefined, name: player.fullName, context });
        }
      } else {
        setAdded({ note: `✅ ${t.name} added.` });
      }

      setName(''); setShort(''); setMgrName(''); setMgrPhone(''); setMgrEmail(''); setMgrOpen(false); setAdding(false);
      setDirty(true);
      setSelected((p) => [...p, t.id]);
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add team');
    } finally { setBusy(false); }
  }

  async function save() {
    setError(null); setBusy(true);
    try {
      const added = selected.filter((id) => !original.includes(id));
      const removed = original.filter((id) => !selected.includes(id));
      if (added.length) await addTournamentTeams(params.tournamentId, added);
      for (const id of removed) await removeTournamentTeam(params.tournamentId, id);
      setDirty(false);
      setTick((n) => n + 1);
      nav.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save participants');
    } finally { setBusy(false); }
  }

  const sportName = getSport(sport).name;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Participating teams" subtitle={tournament?.name ?? 'Register who’s in'} />

        {tourSports.length > 1 && (
          <>
            <Text style={textStyles.muted}>Sport</Text>
            <View style={st.chips}>
              {tourSports.map((s) => (
                <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={sport === s} onPress={() => pickSport(s)} />
              ))}
            </View>
          </>
        )}

        <View style={st.rowBetween}>
          <Text style={textStyles.h3}>{selected.length} team{selected.length === 1 ? '' : 's'} in</Text>
          {allTeams.length > 0 && (
            <Text style={st.link} onPress={() => { setDirty(true); setSelected(selected.length === allTeams.length ? [] : allTeams.map((t) => t.id)); }}>
              {selected.length === allTeams.length ? 'Clear all' : 'Select all'}
            </Text>
          )}
        </View>

        {unregisteredInFixtures.length > 0 && (
          <Text style={st.hint} onPress={() => { setDirty(true); setSelected((p) => [...new Set([...p, ...inFixtures])]); }}>
            ＋ {unregisteredInFixtures.length} team{unregisteredInFixtures.length === 1 ? '' : 's'} already playing here aren’t registered — tap to add them.
          </Text>
        )}

        {allTeams.length === 0 ? (
          <Text style={textStyles.muted}>No {sportName} teams yet. Add one below.</Text>
        ) : (
          <View style={st.chips}>
            {allTeams.map((t) => (
              <SelectChip key={t.id} label={t.name} active={selected.includes(t.id)} onPress={() => toggle(t.id)} />
            ))}
          </View>
        )}

        {/* Inline add-a-team so an organizer can build the roster without leaving. */}
        {adding ? (
          <Card style={{ gap: theme.spacing(3) }}>
            <Text style={textStyles.h3}>Add a {sportName} team</Text>
            <View style={st.row}>
              <View style={st.flex2}><TextField label="Name" value={name} onChange={setName} placeholder="Red House" /></View>
              <View style={st.flex1}><TextField label="Short" value={short} onChange={setShort} placeholder="RED" autoCapitalize="characters" /></View>
            </View>
            <Text style={textStyles.muted}>Colour</Text>
            <View style={st.chips}>
              {PALETTE.map((c) => (
                <Text key={c} accessibilityRole="button" onPress={() => setColor(c)} style={[st.swatch, { backgroundColor: c }, color === c && st.swatchActive]} />
              ))}
            </View>

            {/* Optional team manager: makes the team a real, contactable entity and
                invites that person to claim it & manage the squad. */}
            {mgrOpen ? (
              <View style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.muted}>Team manager / captain — they’ll be invited to claim the team and set its squad.</Text>
                <TextField label="Manager name" value={mgrName} onChange={setMgrName} placeholder="Who runs this team?" />
                <View style={st.row}>
                  <View style={st.flex1}><TextField label="Phone" value={mgrPhone} onChange={setMgrPhone} placeholder="+91…" autoCapitalize="none" /></View>
                  <View style={st.flex1}><TextField label="Email" value={mgrEmail} onChange={setMgrEmail} placeholder="name@email.com" autoCapitalize="none" /></View>
                </View>
              </View>
            ) : (
              <Text style={st.link} onPress={() => setMgrOpen(true)}>＋ Add a team manager (optional)</Text>
            )}

            <View style={st.row}>
              <View style={st.flex1}><Button label="Cancel" variant="ghost" onPress={() => { setAdding(false); setError(null); }} /></View>
              <View style={st.flex1}><Button label={busy ? 'Adding…' : 'Add & select'} onPress={addNewTeam} disabled={busy} /></View>
            </View>
          </Card>
        ) : (
          <Button label="＋ New team" variant="ghost" onPress={() => setAdding(true)} />
        )}

        {added && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.body}>{added.note}</Text>
            {added.link && (
              <View style={st.chips}>
                {added.phone ? (
                  <>
                    <Button label="💬 WhatsApp" variant="ghost" onPress={() => openWhatsApp(added.phone!, inviteMessage({ name: added.name ?? '', inviterName, link: added.link!, context: added.context, role: 'manage' }))} />
                    <Button label="✉️ SMS" variant="ghost" onPress={() => openSms(added.phone!, inviteMessage({ name: added.name ?? '', inviterName, link: added.link!, context: added.context, role: 'manage' }))} />
                  </>
                ) : null}
              </View>
            )}
            <Text style={st.link} onPress={() => setAdded(null)}>Dismiss</Text>
          </Card>
        )}

        <FormError message={error} />
        <Button
          label={busy ? 'Saving…' : dirty ? `Save ${selected.length} participant${selected.length === 1 ? '' : 's'}` : 'Done'}
          onPress={save}
          disabled={busy}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  hint: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  swatchActive: { borderColor: theme.colors.text },
});
