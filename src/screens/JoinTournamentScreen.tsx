/** Enter your team in a tournament from its join link (parity #10). The organiser
 *  turns on "Teams can join by link" and shares one WhatsApp link; a captain opens
 *  it (or types the T- code under "Join a team"), picks one of the teams they
 *  manage — or makes one — and it's in the tournament at once (confirmed).
 *  Guests see the tournament name and a sign-in button that brings them back. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, ScreenTitle, FormError, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { isGuestSession, promptSignIn } from '../core/guest';
import { notice } from '../core/confirm';
import { getSport } from '../sports/registry';
import { useCaptainships, useTournamentCategories } from '../data/hooks';
import { getTournamentInvite, redeemTournamentInvite, getTeams, canManageTeam, getMyPlayerId, createTeam, type TournamentInviteInfo } from '../data/repos';
import { filterTeams } from '../core/teamSearch';
import type { SportId, Team } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const PALETTE = ['#FF5C5C', '#4DA3FF', '#3DDC97', '#FFB454', '#B98AFF', '#FF8AC4'];

export default function JoinTournamentScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'JoinTournament'>>();
  const { profile, authed } = useAuth();
  const guest = isGuestSession(authed);
  const { isCaptain } = useCaptainships();

  const [code, setCode] = useState(params?.token ?? '');
  const [info, setInfo] = useState<TournamentInviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Teams I manage for one of the tournament's sports (null = still loading).
  const [myTeams, setMyTeams] = useState<Team[] | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const categories = useTournamentCategories(info?.tournamentId);
  const [catId, setCatId] = useState<string | null>(null);

  // "＋ New team" inline form.
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [newSport, setNewSport] = useState<SportId | null>(null);

  async function find(auto?: string) {
    const c = (auto ?? code).trim();
    setError(null); setInfo(null); setMyTeams(null); setTeamId(null);
    if (!c) return setError('Enter the tournament code.');
    setBusy(true);
    let inv: TournamentInviteInfo | null = null;
    try { inv = await getTournamentInvite(c); }
    catch (e) { setBusy(false); return setError((e as Error).message); }
    setBusy(false);
    if (!inv) return setError('That code isn’t valid.');
    setInfo(inv);
    setNewSport(inv.sports[0] ?? null);
  }

  // Arriving from the link → resolve the code straight away (members only:
  // the lookup needs an account).
  useEffect(() => { if (params?.token && !guest) void find(params.token); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params?.token, guest]);

  // Load the teams I may enter: the tournament's sports, teams I manage.
  useEffect(() => {
    if (!info?.active) return;
    let on = true;
    void (async () => {
      const sports = info.sports.length ? info.sports : [undefined];
      const lists = await Promise.all(sports.map((s) => getTeams(s)));
      const candidates = lists.flat().filter((t) => !t.adhoc);
      const myPlayerId = await getMyPlayerId(profile?.id);
      const ctx = { profileId: profile?.id, myPlayerId, role: profile?.role };
      const oks = await Promise.all(candidates.map((t) => canManageTeam(t.id, { ...ctx, isCaptainStore: isCaptain(t.id) }).catch(() => false)));
      if (!on) return;
      const mine = candidates.filter((_, i) => oks[i]);
      setMyTeams(mine);
      if (mine.length === 1) setTeamId(mine[0].id);
    })();
    return () => { on = false; };
  }, [info, profile?.id, profile?.role, isCaptain]);

  useEffect(() => { if (categories.length === 1) setCatId(categories[0].id); }, [categories]);

  async function addTeam() {
    if (!info) return;
    const sport = newSport ?? info.sports[0];
    if (!name.trim()) return setError('Give your team a name.');
    const sc = short.trim().toUpperCase();
    if (sc.length < 2 || sc.length > 4) return setError('The short name is 2–4 letters, e.g. RED.');
    if (!sport) return setError('Pick a sport.');
    setError(null); setBusy(true);
    try {
      const t = await createTeam({ name: name.trim(), shortName: sc, sport, colorHex: PALETTE[Math.floor(Math.random() * PALETTE.length)] });
      setMyTeams((p) => [t, ...(p ?? [])]);
      setTeamId(t.id);
      setAdding(false); setName(''); setShort('');
    } catch (e) {
      notice('Couldn’t create the team', e instanceof Error ? e.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  async function enter() {
    if (!info || !teamId) return;
    if (categories.length > 0 && !catId) return setError('Pick your division.');
    setError(null); setBusy(true);
    try {
      const r = await redeemTournamentInvite(code, teamId, catId ?? undefined);
      const t = myTeams?.find((x) => x.id === teamId);
      notice(r === 'already' ? 'Already in' : 'You’re in! 🎉', r === 'already'
        ? `${t?.name ?? 'Your team'} is already in ${info.name}.`
        : `${t?.name ?? 'Your team'} is entered in ${info.name}.`);
      nav.navigate('Tournament', { tournamentId: info.tournamentId, tab: 'Teams' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t enter the team — try again.');
    } finally { setBusy(false); }
  }

  const selected = myTeams?.find((t) => t.id === teamId);
  const shown = myTeams ? filterTeams(myTeams, query, teamId ? [teamId] : []) : [];
  const multiSport = (info?.sports.length ?? 0) > 1;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Enter a tournament" subtitle="Use the code or link the organiser shared" />

        {guest ? (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.body}>Sign in to enter your team.</Text>
            <Text style={textStyles.muted}>You’ll come straight back here with the code filled in.</Text>
            <Button label="Sign in" onPress={() => promptSignIn('in')} />
          </Card>
        ) : (
          <>
            <TextField label="Tournament code" value={code} onChange={setCode} placeholder="T-ABC123" autoCapitalize="characters" />
            {!info && <FormError message={error} />}
            <Button label={busy && !info ? 'Checking…' : 'Find tournament'} variant={info ? 'ghost' : undefined} onPress={() => find()} disabled={busy} />
          </>
        )}

        {info && !info.active && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>{info.name}</Text>
            <Text style={textStyles.body}>This link is turned off</Text>
            <Text style={textStyles.muted}>Ask the organiser to turn “Teams can join by link” back on, or to add your team.</Text>
          </Card>
        )}

        {info?.active && (
          <Card style={{ gap: theme.spacing(3) }}>
            <View>
              <Text style={textStyles.h3}>{info.name}</Text>
              <Text style={textStyles.muted}>{info.sports.map((s) => `${getSport(s).icon} ${getSport(s).name}`).join(' · ')}</Text>
            </View>

            <Text style={textStyles.h3}>Your teams</Text>
            {myTeams === null ? (
              <Text style={textStyles.muted}>Loading your teams…</Text>
            ) : myTeams.length === 0 ? (
              <Text style={textStyles.muted}>You don’t manage a {info.sports.map((s) => getSport(s).name).join(' / ')} team yet — make one below.</Text>
            ) : (
              <>
                {myTeams.length > 8 && <TextField label="" value={query} onChange={setQuery} placeholder="Search your teams" autoCapitalize="none" />}
                {shown.slice(0, 30).map((t) => {
                  const on = t.id === teamId;
                  return (
                    <Text
                      key={t.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setTeamId(t.id)}
                      style={[st.radio, on && st.radioOn]}
                      numberOfLines={1}
                    >
                      {on ? '◉' : '○'}  {t.name}{multiSport ? `  ${getSport(t.sport).icon}` : ''}
                    </Text>
                  );
                })}
              </>
            )}

            {adding ? (
              <View style={{ gap: theme.spacing(2) }}>
                {multiSport && (
                  <View style={st.chips}>
                    {info.sports.map((s) => (
                      <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={newSport === s} onPress={() => setNewSport(s)} />
                    ))}
                  </View>
                )}
                <View style={st.row}>
                  <View style={st.flex2}><TextField label="Team name" value={name} onChange={setName} placeholder="Red House" /></View>
                  <View style={st.flex1}><TextField label="Short" value={short} onChange={(v) => setShort(v.toUpperCase().slice(0, 4))} placeholder="RED" autoCapitalize="characters" /></View>
                </View>
                <View style={st.row}>
                  <View style={st.flex1}><Button label="Cancel" variant="ghost" onPress={() => { setAdding(false); setError(null); }} /></View>
                  <View style={st.flex1}><Button label={busy ? 'Creating…' : 'Create team'} onPress={addTeam} disabled={busy} /></View>
                </View>
              </View>
            ) : (
              <Text style={st.link} accessibilityRole="button" onPress={() => setAdding(true)}>＋ New team</Text>
            )}

            {categories.length > 0 && (
              <>
                <Text style={textStyles.muted}>Division</Text>
                <View style={st.chips}>
                  {categories.map((c) => (
                    <SelectChip key={c.id} label={c.label} active={catId === c.id} onPress={() => setCatId(c.id)} />
                  ))}
                </View>
              </>
            )}

            <FormError message={error} />
            <Button
              label={busy ? 'Entering…' : selected ? `Enter ${selected.name}` : 'Pick a team to enter'}
              onPress={enter}
              disabled={busy || !selected}
            />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  radio: {
    color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600',
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2.5), paddingHorizontal: theme.spacing(3),
  },
  radioOn: { borderColor: theme.colors.primary, color: theme.colors.primary },
});
