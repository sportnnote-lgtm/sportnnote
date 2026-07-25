/** Edit your own player profile — contact details, base city, the sports you
 *  play, and per-sport position, dominant side(s) and the teams you've
 *  represented. Club & jersey aren't global: they live under each sport, since
 *  every team / tournament / game can mean a different team and number. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, Card, textStyles } from '../components/ui';
import { DateField } from '../components/DateTimeField';
import { SPORT_LIST, getSport } from '../sports/registry';
import { SPORT_SIDE_FIELDS, POSITION_HINT } from '../data/sportProfileFields';
import { getPlayer, updatePlayer } from '../data/repos';
import { ageFromDob } from '../core/age';
import type { Player, SportDetail, SportId, TeamStint } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export default function EditProfileScreen({ route, navigation }: Props) {
  const { playerId } = route.params;

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // Parent/guardian — for young players without their own phone/email.
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [sports, setSports] = useState<SportId[]>([]);
  const [details, setDetails] = useState<Partial<Record<SportId, SportDetail>>>({});
  // Original contact + verification, to reset a channel's verified flag if edited.
  const [loaded, setLoaded] = useState<{ phone: string; email: string; phoneVerified: boolean; emailVerified: boolean; guardian?: Player['guardian'] }>(
    { phone: '', email: '', phoneVerified: false, emailVerified: false }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    getPlayer(playerId).then((p) => {
      if (!on || !p) return;
      setName(p.fullName);
      setCity(p.city ?? '');
      setDob(p.dob ?? '');
      setPhone(p.phone ?? '');
      setEmail(p.email ?? '');
      setGName(p.guardian?.name ?? '');
      setGPhone(p.guardian?.phone ?? '');
      setGEmail(p.guardian?.email ?? '');
      setSports(p.sports);
      setDetails(p.sportDetails ?? {});
      setLoaded({ phone: p.phone ?? '', email: p.email ?? '', phoneVerified: !!p.phoneVerified, emailVerified: !!p.emailVerified, guardian: p.guardian });
    });
    return () => {
      on = false;
    };
  }, [playerId]);

  const toggleSport = (s: SportId) =>
    setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const patchDetail = (s: SportId, patch: Partial<SportDetail>) =>
    setDetails((prev) => ({ ...prev, [s]: { ...prev[s], ...patch } }));

  const setSide = (s: SportId, key: string, value: string) => {
    const cur = details[s]?.sides ?? {};
    const sides = { ...cur };
    if (sides[key] === value) delete sides[key]; // tap again to clear
    else sides[key] = value;
    patchDetail(s, { sides });
  };

  const updateTeam = (s: SportId, i: number, patch: Partial<TeamStint>) => {
    const teams = [...(details[s]?.teams ?? [])];
    teams[i] = { ...teams[i], ...patch };
    patchDetail(s, { teams });
  };
  const addTeam = (s: SportId) => patchDetail(s, { teams: [...(details[s]?.teams ?? []), { name: '' }] });
  const removeTeam = (s: SportId, i: number) =>
    patchDetail(s, { teams: (details[s]?.teams ?? []).filter((_, j) => j !== i) });

  async function save() {
    if (!name.trim()) return setError('Enter your name.');
    // Date of birth is mandatory; minors must have a guardian contact.
    const age = ageFromDob(dob.trim());
    if (!dob.trim() || age === undefined) return setError('Enter a valid date of birth (YYYY-MM-DD).');
    if (age < 18) {
      if (!gName.trim()) return setError('A parent/guardian name is required for players under 18.');
      if (!gPhone.trim() && !gEmail.trim()) return setError("Add the guardian's phone or email — under-18 players need a guardian contact.");
    }
    setError(null);
    setBusy(true);
    try {
      // Keep details only for sports still selected; drop blank teams.
      const kept: Partial<Record<SportId, SportDetail>> = {};
      for (const s of sports) {
        const d = details[s];
        if (!d) continue;
        const teams = (d.teams ?? [])
          .map((t) => ({ name: t.name.trim(), jersey: t.jersey, since: t.since, until: t.until }))
          .filter((t) => t.name.length > 0);
        kept[s] = { position: d.position?.trim() || undefined, sides: d.sides, teams: teams.length ? teams : undefined };
      }
      // Changing a contact resets its verified status (the new value is unverified).
      const phoneVerified = phone.trim() === loaded.phone ? loaded.phoneVerified : false;
      const emailVerified = email.trim() === loaded.email ? loaded.emailVerified : false;
      // Guardian — preserve a channel's verified flag only if its value is unchanged.
      const g = loaded.guardian;
      const guardian = gName.trim()
        ? {
            name: gName.trim(),
            phone: gPhone.trim() || undefined,
            email: gEmail.trim() || undefined,
            phoneVerified: gPhone.trim() && gPhone.trim() === (g?.phone ?? '') ? g?.phoneVerified : false,
            emailVerified: gEmail.trim() && gEmail.trim() === (g?.email ?? '') ? g?.emailVerified : false,
          }
        : undefined;
      await updatePlayer(playerId, {
        fullName: name.trim(),
        city: city.trim(),
        dob: dob.trim(),
        phone: phone.trim(),
        email: email.trim(),
        phoneVerified,
        emailVerified,
        guardian,
        sports,
        sportDetails: kept,
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Edit profile" subtitle="Your details, as you want them shown" />

        <TextField label="Full name" value={name} onChange={setName} placeholder="Your name" />
        <View style={st.row}>
          <View style={st.flex}><TextField label="Base city" value={city} onChange={setCity} placeholder="Bengaluru" /></View>
          <View style={st.flex}>
            <DateField label="Date of birth" value={dob} onChange={setDob} />
            {ageFromDob(dob) !== undefined ? <Text style={st.ageHint}>Age: {ageFromDob(dob)} yrs</Text> : null}
          </View>
        </View>
        <View style={st.row}>
          <View style={st.flex}><TextField label="Contact number" value={phone} onChange={setPhone} placeholder="+91…" autoCapitalize="none" /></View>
          <View style={st.flex}><TextField label="Email" value={email} onChange={setEmail} placeholder="you@email.com" autoCapitalize="none" /></View>
        </View>
        <Text style={textStyles.muted}>Your contact details are visible only to you.</Text>

        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>👪 Parent / Guardian (optional)</Text>
          <Text style={textStyles.muted}>
            For young players who don&apos;t have their own phone or email, a parent/guardian can be the point of contact. Their phone &amp; email are verified, and you can upload a document on your profile to confirm age &amp; guardianship.
          </Text>
          <TextField label="Guardian name" value={gName} onChange={setGName} placeholder="e.g. Priya Mehta" />
          <View style={st.row}>
            <View style={st.flex}><TextField label="Guardian phone" value={gPhone} onChange={setGPhone} placeholder="+91…" autoCapitalize="none" /></View>
            <View style={st.flex}><TextField label="Guardian email" value={gEmail} onChange={setGEmail} placeholder="parent@email.com" autoCapitalize="none" /></View>
          </View>
        </Card>

        <Text style={[textStyles.h3, st.section]}>Sports you play</Text>
        <View style={st.chips}>
          {SPORT_LIST.map((s) => (
            <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sports.includes(s.id)} onPress={() => toggleSport(s.id)} />
          ))}
        </View>

        {sports.map((s) => {
          const d = details[s] ?? {};
          const fields = SPORT_SIDE_FIELDS[s];
          const teams = d.teams ?? [];
          return (
            <Card key={s} style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.h3}>{getSport(s).icon} {getSport(s).name}</Text>
              <TextField
                label="Position / role"
                value={d.position ?? ''}
                onChange={(v) => patchDetail(s, { position: v })}
                placeholder={POSITION_HINT[s]}
              />

              {fields.map((f) => (
                <View key={f.key} style={{ gap: theme.spacing(1) }}>
                  <Text style={textStyles.muted}>{f.label}</Text>
                  <View style={st.chips}>
                    {f.options.map((opt) => (
                      <SelectChip key={opt} label={opt} active={d.sides?.[f.key] === opt} onPress={() => setSide(s, f.key, opt)} />
                    ))}
                  </View>
                </View>
              ))}

              <Text style={[textStyles.muted, { marginTop: theme.spacing(1) }]}>Teams represented</Text>
              {teams.map((t, i) => (
                <View key={i} style={st.teamRow}>
                  <View style={{ flex: 1 }}>
                    <TextField label="Team / club" value={t.name} onChange={(v) => updateTeam(s, i, { name: v })} placeholder="Red House" />
                  </View>
                  <View style={st.jerseyCol}>
                    <TextField
                      label="Jersey"
                      value={t.jersey != null ? String(t.jersey) : ''}
                      onChange={(v) => updateTeam(s, i, { jersey: v.trim() ? Number(v.replace(/[^0-9]/g, '')) : undefined })}
                      placeholder="10"
                      autoCapitalize="none"
                    />
                  </View>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove team" onPress={() => removeTeam(s, i)} style={st.removeBtn} activeOpacity={0.7}>
                    <Text style={st.removeTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={st.addLink} onPress={() => addTeam(s)}>+ Add team</Text>
            </Card>
          );
        })}

        {error && <Text style={st.error}>{error}</Text>}
        <Button label={busy ? 'Saving…' : 'Save profile'} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  section: { marginTop: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  teamRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing(2) },
  jerseyCol: { width: 72 },
  removeBtn: { paddingHorizontal: theme.spacing(2), paddingBottom: theme.spacing(2) },
  removeTxt: { color: theme.colors.danger, fontSize: theme.font.h3, fontWeight: '800' },
  addLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  error: { color: theme.colors.danger, fontSize: theme.font.small },
  ageHint: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 2 },
});
