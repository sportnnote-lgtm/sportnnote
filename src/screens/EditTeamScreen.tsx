/** Edit a team (parity #10): logo, name, short code, colour and city — the way an
 *  organiser fixes a misspelt house name or a captain sets their badge. Only the
 *  team's managers (captain, vice-captain, admins, its creator) may edit; the
 *  server enforces it, so a refusal shows an error, never a fake success.
 *  A club's sport team takes its name and logo from the club page. Delete only
 *  works for a team that has never played a match. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, ScreenTitle, FormError, LoadingState, textStyles } from '../components/ui';
import { LogoPicker } from '../components/LogoPicker';
import { confirmAction, notice } from '../core/confirm';
import { useTeamPermission } from '../data/hooks';
import { getTeams, getTeamDetails, updateTeam, deleteTeam, getClub, isNeedsDbUpdate, type TeamDetails } from '../data/repos';
import type { Team } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const PALETTE = ['#FF5C5C', '#4DA3FF', '#3DDC97', '#FFB454', '#B98AFF', '#FF8AC4', '#7A8699', '#1F2937'];

export default function EditTeamScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'EditTeam'>>();
  const { teamId } = params;
  const { canManage } = useTeamPermission(teamId);

  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  const [details, setDetails] = useState<TeamDetails | null>(null);
  const [clubName, setClubName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [city, setCity] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    void (async () => {
      const [all, d] = await Promise.all([getTeams(), getTeamDetails(teamId)]);
      if (!on) return;
      const t = all.find((x) => x.id === teamId) ?? null;
      setTeam(t);
      setDetails(d);
      if (!t) return;
      setName(t.name); setShort(t.shortName); setColor(t.colorHex);
      setCity(d.city ?? t.city ?? ''); setLogoUrl(d.logoUrl ?? t.logoUrl);
      if (t.clubId) {
        const c = await getClub(t.clubId).catch(() => null);
        if (on) setClubName(c?.name ?? 'the club');
      }
    })();
    return () => { on = false; };
  }, [teamId]);

  if (team === undefined || canManage === null) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><LoadingState /></SafeAreaView>;
  }
  if (team === null) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><Text style={[textStyles.muted, st.pad]}>This team doesn’t exist any more.</Text></SafeAreaView>;
  }
  if (!canManage) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <Text style={[textStyles.muted, st.pad]}>Only {team.name}’s captain, vice-captain or team admins can edit it.</Text>
      </SafeAreaView>
    );
  }

  const isClubTeam = !!team.clubId;
  const supported = details?.supported !== false;
  const shortClean = short.trim().toUpperCase();

  async function save() {
    if (!team) return;
    if (!isClubTeam) {
      if (!name.trim()) return setError('Give the team a name.');
      if (shortClean.length < 2 || shortClean.length > 4) return setError('The short name is 2–4 letters, e.g. RED.');
    }
    setError(null); setBusy(true);
    try {
      await updateTeam(team.id, {
        ...(isClubTeam ? {} : { name: name.trim(), shortName: shortClean }),
        colorHex: color ?? null,
        ...(supported ? { city: city.trim() || null } : {}),
      });
      notice('Team updated', `${isClubTeam ? team.name : name.trim()} was saved.`);
      nav.goBack();
    } catch (e) {
      if (isNeedsDbUpdate(e)) setDetails({ supported: false });
      notice('Couldn’t update the team', e instanceof Error ? e.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!team) return;
    if (!(await confirmAction(`Delete ${team.name}?`, 'The team is deleted for good. This only works for a team that has never played a match.', 'Delete', true))) return;
    setBusy(true);
    try {
      await deleteTeam(team.id);
      notice('Team deleted', `${team.name} was deleted.`);
      // Don't land back on the deleted team's squad page.
      const routes = nav.getState().routes;
      const prev = routes[routes.length - 2]?.name;
      if ((prev === 'Squad' || prev === 'Team') && routes.length > 2) nav.pop(2);
      else nav.goBack();
    } catch (e) {
      notice('Couldn’t delete the team', e instanceof Error ? e.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Edit team" subtitle={team.name} />

        {isClubTeam ? (
          <Text style={st.link} accessibilityRole="link" onPress={() => nav.navigate('ClubHome', { clubId: team.clubId! })}>
            Name and logo belong to {clubName ?? 'the club'} — edit them on the club page ›
          </Text>
        ) : (
          <>
            {supported ? (
              <LogoPicker
                logoUrl={logoUrl}
                canManage
                kind="club-logo"
                size={72}
                placeholder="🛡️"
                label="Add logo"
                onPick={async (url) => { await updateTeam(team.id, { logoUrl: url }); setLogoUrl(url); }}
              />
            ) : null}
            <View style={st.row}>
              <View style={st.flex2}><TextField label="Team name" value={name} onChange={setName} placeholder="Red House" /></View>
              <View style={st.flex1}><TextField label="Short (2–4)" value={short} onChange={(v) => setShort(v.toUpperCase().slice(0, 4))} placeholder="RED" autoCapitalize="characters" /></View>
            </View>
          </>
        )}

        <Text style={textStyles.muted}>Colour</Text>
        <View style={st.chips}>
          {PALETTE.map((c) => (
            <Text key={c} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} accessibilityState={{ selected: color === c }} onPress={() => setColor(c)} style={[st.swatch, { backgroundColor: c }, color === c && st.swatchActive]} />
          ))}
        </View>

        {supported ? (
          <TextField label="City / town" value={city} onChange={setCity} placeholder="Hyderabad" autoCapitalize="words" />
        ) : (
          <Text style={textStyles.muted}>Logo and city · Needs the latest database update</Text>
        )}

        <FormError message={error} />
        <Button label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />

        <Card style={{ gap: theme.spacing(2), marginTop: theme.spacing(4) }}>
          <Text style={textStyles.body}>Delete team</Text>
          <Text style={textStyles.muted}>Only for a team that has never played a match. To take a team out of a tournament, remove it there instead.</Text>
          <Button label="Delete team" variant="ghost" onPress={remove} disabled={busy} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  pad: { padding: theme.spacing(4) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  swatchActive: { borderColor: theme.colors.text },
});
