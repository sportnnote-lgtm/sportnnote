/** Create a team (Club) — the simple, uncluttered first step (spec §1, §11):
 *  name, short code, city, colour, and the SPORTS it plays (multi-select, editable
 *  later). Optionally add yourself as the first member (→ you become an admin).
 *  Everything else — captains, squads, roles, more admins — is configured later
 *  from the team dashboard. On create we land on the dashboard. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, ScreenTitle, FormError, textStyles } from '../components/ui';
import { LogoPicker } from '../components/LogoPicker';
import { SPORT_LIST } from '../sports/registry';
import { useAuth } from '../core/auth';
import { createClub, getMyPlayerId } from '../data/repos';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PALETTE = ['#2E7D6B', '#FF5C5C', '#4DA3FF', '#FFB454', '#B98AFF', '#FF8AC4'];

export default function CreateClubScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CreateClub'>>();
  const { profile } = useAuth();
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => { let on = true; getMyPlayerId(profile?.id).then((id) => on && setMyId(id)); return () => { on = false; }; }, [profile?.id]);

  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [city, setCity] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [color, setColor] = useState(PALETTE[0]);
  const [sports, setSports] = useState<SportId[]>([]);
  const [addMe, setAddMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSport = (s: SportId) => setSports((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  async function create() {
    if (!name.trim()) return setError('Team name is required.');
    if (!sports.length) return setError('Pick at least one sport this team plays.');
    setError(null);
    setBusy(true);
    try {
      const club = await createClub({
        name: name.trim(),
        shortName: short.trim().toUpperCase(),
        city: city.trim() || undefined,
        colorHex: color,
        logoUrl,
        orgId: params?.orgId,
        createdBy: profile?.id,
        firstMemberPlayerId: addMe && myId ? myId : undefined,
        sports,
      });
      // Replace so Back from the dashboard returns to the teams list, not the form.
      nav.replace('ClubHome', { clubId: club.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create team');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Create your team" subtitle="One team, many sports — add the rest later" />

        <Card style={{ gap: theme.spacing(3) }}>
          <View style={{ alignItems: 'center' }}>
            <LogoPicker logoUrl={logoUrl} canManage onPick={setLogoUrl} kind="club-logo" size={72} placeholder="🛡️" label="Add logo" />
          </View>
          <View style={st.row}>
            <View style={st.flex2}>
              <TextField label="Team name" value={name} onChange={setName} placeholder="Hyderabad Warriors" />
            </View>
            <View style={st.flex1}>
              <TextField label="Short" value={short} onChange={setShort} placeholder="HW" autoCapitalize="characters" />
            </View>
          </View>
          <TextField label="City / Town" value={city} onChange={setCity} placeholder="Hyderabad" />

          <View>
            <Text style={textStyles.muted}>Team colour</Text>
            <View style={st.chips}>
              {PALETTE.map((c) => (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Colour ${c}`}
                  key={c} onPress={() => setColor(c)}
                  style={[st.swatch, { backgroundColor: c }, color === c && st.swatchActive]} />
              ))}
            </View>
          </View>
        </Card>

        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>Which sports does this team play?</Text>
          <Text style={textStyles.muted}>Pick one or more. You can add or remove sports anytime.</Text>
          <View style={st.chips}>
            {SPORT_LIST.map((s) => (
              <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sports.includes(s.id)} onPress={() => toggleSport(s.id)} />
            ))}
          </View>
        </Card>

        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: addMe }} onPress={() => setAddMe((v) => !v)} style={st.check}>
          <View style={[st.box, addMe && st.boxOn]}>{addMe && <Text style={st.tick}>✓</Text>}</View>
          <View style={{ flex: 1 }}>
            <Text style={textStyles.body}>Add myself to this team</Text>
            <Text style={textStyles.muted}>You’ll be the first member — and its admin.</Text>
          </View>
        </TouchableOpacity>

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : 'Create team'} onPress={create} />
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), marginTop: theme.spacing(1) },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: theme.colors.text },
  check: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tick: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
