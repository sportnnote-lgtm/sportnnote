/** Edit your own player profile — contact details, base city, the sports you
 *  play, and per-sport position, dominant side(s) and the teams you've
 *  represented. Club & jersey aren't global: they live under each sport, since
 *  every team / tournament / game can mean a different team and number.
 *
 *  Admin mode (`asAdmin`, parity #12): a team / tournament manager fixes an
 *  UNCLAIMED player's details — name, photo, shirt number, city, gender, DOB
 *  (optional), sides. A phone / email already on file is read-only, privacy is
 *  never shown, and a guardian is recommended for under-18s but not required.
 *  The save goes through adminPatch so nothing the server would lock is sent. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, Card, FieldLabel, FormError, textStyles } from '../components/ui';
import { DateField } from '../components/DateTimeField';
import { SPORT_LIST, getSport } from '../sports/registry';
import { SPORT_SIDE_FIELDS, POSITION_HINT } from '../data/sportProfileFields';
import { getPlayer, updatePlayer } from '../data/repos';
import { LogoPicker } from '../components/LogoPicker';
import { adminPatch } from '../core/playerEditAccess';
import { notice } from '../core/confirm';
import { ageFromDob } from '../core/age';
import type { Player, SportDetail, SportId, TeamStint } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

export default function EditProfileScreen({ route, navigation }: Props) {
  const { playerId } = route.params;
  const asAdmin = route.params.asAdmin === true || String(route.params.asAdmin) === 'true';

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [gender, setGender] = useState('');
  const [bio, setBio] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // Privacy (migration 0026): contact details are hidden by default; adults may
  // choose to show their mobile / email on their public profile.
  const [showPhone, setShowPhone] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  // Discover: let other members find me by my exact phone/email (adults; default on).
  const [findable, setFindable] = useState(true);
  // Parent/guardian — for young players without their own phone/email.
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  // Admin mode only: the player's own shirt number (self mode keeps per-team jerseys).
  const [jersey, setJersey] = useState('');
  const [sports, setSports] = useState<SportId[]>([]);
  const [details, setDetails] = useState<Partial<Record<SportId, SportDetail>>>({});
  // Original contact + verification, to reset a channel's verified flag if edited.
  const [loaded, setLoaded] = useState<{ phone: string; email: string; phoneVerified: boolean; emailVerified: boolean; guardian?: Player['guardian']; name: string; photoUrl: string }>(
    { phone: '', email: '', phoneVerified: false, emailVerified: false, name: '', photoUrl: '' }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    getPlayer(playerId).then((p) => {
      if (!on || !p) return;
      setName(p.fullName);
      setCity(p.city ?? '');
      setGender(p.gender ?? '');
      setBio(p.bio ?? '');
      setDob(p.dob ?? '');
      setPhone(p.phone ?? '');
      setEmail(p.email ?? '');
      setShowPhone(!!p.showPhone);
      setShowEmail(!!p.showEmail);
      setFindable(p.findableByContact !== false);
      setGName(p.guardian?.name ?? '');
      setGPhone(p.guardian?.phone ?? '');
      setGEmail(p.guardian?.email ?? '');
      setPhotoUrl(p.photoUrl ?? '');
      setJersey(p.jerseyNo != null ? String(p.jerseyNo) : '');
      setSports(p.sports);
      setDetails(p.sportDetails ?? {});
      setLoaded({ phone: p.phone ?? '', email: p.email ?? '', phoneVerified: !!p.phoneVerified, emailVerified: !!p.emailVerified, guardian: p.guardian, name: p.fullName, photoUrl: p.photoUrl ?? '' });
    });
    return () => {
      on = false;
    };
  }, [playerId]);

  useEffect(() => {
    if (asAdmin) navigation.setOptions({ title: 'Edit player' });
  }, [asAdmin, navigation]);

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

  // Keep details only for sports still selected; drop blank teams.
  function keptDetails(): Partial<Record<SportId, SportDetail>> {
    const kept: Partial<Record<SportId, SportDetail>> = {};
    for (const s of sports) {
      const d = details[s];
      if (!d) continue;
      const teams = (d.teams ?? [])
        .map((t) => ({ name: t.name.trim(), jersey: t.jersey, since: t.since, until: t.until }))
        .filter((t) => t.name.length > 0);
      kept[s] = { position: d.position?.trim() || undefined, sides: d.sides, teams: teams.length ? teams : undefined };
    }
    return kept;
  }

  async function saveAsAdmin() {
    if (!name.trim()) return setError('Enter the player’s name.');
    // DOB is optional here (the admin may not know it) — but validated if entered.
    if (dob.trim() && ageFromDob(dob.trim()) === undefined) return setError('Enter a valid date of birth (YYYY-MM-DD), or leave it blank.');
    const jerseyNo = jersey.trim() ? Number(jersey.replace(/[^0-9]/g, '')) : undefined;
    if (jersey.trim() && (!Number.isFinite(jerseyNo) || (jerseyNo as number) > 999)) return setError('Shirt number should be 0–999.');
    setError(null);
    setBusy(true);
    try {
      await updatePlayer(playerId, adminPatch({
        fullName: name, city, gender, dob, phone, email,
        photoUrl: photoUrl !== loaded.photoUrl ? photoUrl : undefined,
        jerseyNo,
        // Only a changed guardian is written (keeps its verified flags otherwise).
        guardian: gName.trim() && (gName.trim() !== (loaded.guardian?.name ?? '') || gPhone.trim() !== (loaded.guardian?.phone ?? '') || gEmail.trim() !== (loaded.guardian?.email ?? ''))
          ? { name: gName, phone: gPhone, email: gEmail } : undefined,
        sports,
        sportDetails: keptDetails(),
      }, { phone: loaded.phone, email: loaded.email }));
      notice('Saved', `${name.trim()}’s details were updated.`);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the player’s details');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (asAdmin) return saveAsAdmin();
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
      const kept = keptDetails();
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
        gender: gender.trim(),
        bio: bio.trim(),
        dob: dob.trim(),
        phone: phone.trim(),
        email: email.trim(),
        phoneVerified,
        emailVerified,
        // Under-18s can never make contact details public (also enforced server-side).
        showPhone: age >= 18 && showPhone && !!phone.trim(),
        showEmail: age >= 18 && showEmail && !!email.trim(),
        findableByContact: age >= 18 && findable,
        guardian,
        sports,
        sportDetails: kept,
        ...(photoUrl !== loaded.photoUrl ? { photoUrl } : {}),
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setBusy(false);
    }
  }

  const age = ageFromDob(dob);
  const under18 = age !== undefined && age < 18;
  const guardianRequired = !asAdmin && under18;
  const initials = (name.trim() || loaded.name).split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '🙂';
  // Admin mode: the guardian card is a recommendation for under-18s only. A
  // guardian the admin can't see (live reads hide it) is "on file" — not editable.
  const guardianOnFile = !!loaded.guardian?.hidden && !!loaded.guardian?.present;
  const showGuardian = !asAdmin || under18;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        {asAdmin ? (
          <ScreenTitle title="Edit player details" subtitle={`You added ${loaded.name || 'this player'} — they can change these once they join`} />
        ) : (
          <ScreenTitle title="Edit profile" subtitle="Your details, as you want them shown" />
        )}

        <View style={st.photoRow}>
          <LogoPicker
            logoUrl={photoUrl || undefined}
            canManage
            kind="player-photo"
            shape="circle"
            size={72}
            placeholder={initials}
            label="Add photo"
            onPick={(url) => setPhotoUrl(url)}
          />
          {asAdmin && (
            <View style={st.jerseyCol}>
              <TextField label="Shirt no." value={jersey} onChange={(v) => setJersey(v.replace(/[^0-9]/g, '').slice(0, 3))} placeholder="10" autoCapitalize="none" />
            </View>
          )}
        </View>

        <TextField label="Full name" value={name} onChange={setName} placeholder="First & last name" />
        <View style={st.row}>
          <View style={st.flex}><TextField label="Location (city)" value={city} onChange={setCity} placeholder="Bengaluru" /></View>
          <View style={st.flex}>
            <DateField label={asAdmin ? 'Date of birth (optional)' : 'Date of birth'} value={dob} onChange={setDob} />
            {age !== undefined ? <Text style={st.ageHint}>Age: {age} yrs</Text> : null}
          </View>
        </View>

        <View style={{ gap: theme.spacing(1) }}>
          <FieldLabel>Gender</FieldLabel>
          <View style={st.chips}>
            {GENDERS.map((g) => (
              <SelectChip key={g} label={g} active={gender === g} onPress={() => setGender(gender === g ? '' : g)} />
            ))}
          </View>
        </View>

        <View style={st.row}>
          <View style={st.flex}>
            {asAdmin && loaded.phone ? (
              <OnFile label="Contact number" />
            ) : (
              <TextField label="Contact number" value={phone} onChange={setPhone} placeholder="+91…" autoCapitalize="none" />
            )}
          </View>
          <View style={st.flex}>
            {asAdmin && loaded.email ? (
              <OnFile label="Email" />
            ) : (
              <TextField label="Email" value={email} onChange={setEmail} placeholder={asAdmin ? 'name@email.com' : 'you@email.com'} autoCapitalize="none" />
            )}
          </View>
        </View>
        {asAdmin && (loaded.phone || loaded.email) ? (
          <Text style={textStyles.muted}>A number or email on file can’t be changed — it’s how they claim this profile. Ask support if it’s wrong.</Text>
        ) : null}
        {!asAdmin && (<>
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>🔒 Who can see your contact details</Text>
          {guardianRequired ? (
            <Text style={textStyles.muted}>
              Hidden. Players under 18 can&apos;t show their contact details publicly — coaches and scouts reach you through your parent/guardian.
            </Text>
          ) : (
            <>
              <Text style={textStyles.muted}>
                Hidden by default — only you and SportnNote support can see them. Turn one on to show it on your public profile.
              </Text>
              <View style={st.switchRow}>
                <Text style={[textStyles.body, st.flex]}>Show my mobile number</Text>
                <Switch value={showPhone && !!phone.trim()} onValueChange={setShowPhone} disabled={!phone.trim()} accessibilityLabel="Show my mobile number on my profile" />
              </View>
              <View style={st.switchRow}>
                <Text style={[textStyles.body, st.flex]}>Show my email</Text>
                <Switch value={showEmail && !!email.trim()} onValueChange={setShowEmail} disabled={!email.trim()} accessibilityLabel="Show my email on my profile" />
              </View>
              <View style={st.switchRow}>
                <View style={st.flex}>
                  <Text style={textStyles.body}>Let people find me by my phone or email</Text>
                  <Text style={textStyles.muted}>Members who already know your number or email can find your profile in Discover. They still won’t see it.</Text>
                </View>
                <Switch value={findable} onValueChange={setFindable} accessibilityLabel="Let people find me by my phone or email" />
              </View>
            </>
          )}
        </Card>

        <TextField label="About you (optional)" value={bio} onChange={setBio} placeholder="A short note about you — how you play, what you're into…" multiline />
        </>)}

        {showGuardian && (
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>👪 Parent / Guardian {guardianRequired ? '· required' : asAdmin ? '· recommended' : '(optional)'}</Text>
          {guardianRequired && (
            <Text style={st.requiredNote}>Required — this player is under 18. Add a name and a phone or email.</Text>
          )}
          {asAdmin && (
            <Text style={st.requiredNote}>Recommended — this player is under 18. Add a parent or guardian so someone can be reached.</Text>
          )}
          {asAdmin && guardianOnFile ? (
            <Text style={textStyles.muted}>A guardian is already on file.</Text>
          ) : (<>
          <Text style={textStyles.muted}>
            For young players who don&apos;t have their own phone or email, a parent/guardian can be the point of contact. Their phone &amp; email are verified, and you can upload a document on your profile to confirm age &amp; guardianship.
          </Text>
          <TextField label="Guardian name" value={gName} onChange={setGName} placeholder="e.g. Priya Mehta" />
          <View style={st.row}>
            <View style={st.flex}><TextField label="Guardian phone" value={gPhone} onChange={setGPhone} placeholder="+91…" autoCapitalize="none" /></View>
            <View style={st.flex}><TextField label="Guardian email" value={gEmail} onChange={setGEmail} placeholder="parent@email.com" autoCapitalize="none" /></View>
          </View>
          </>)}
        </Card>
        )}

        <Text style={[textStyles.h3, st.section]}>{asAdmin ? 'Sports they play' : 'Sports you play'}</Text>
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
                  <FieldLabel>{f.label}</FieldLabel>
                  <View style={st.chips}>
                    {f.options.map((opt) => (
                      <SelectChip key={opt} label={opt} active={d.sides?.[f.key] === opt} onPress={() => setSide(s, f.key, opt)} />
                    ))}
                  </View>
                </View>
              ))}

              <View style={{ marginTop: theme.spacing(1) }}><FieldLabel>Teams represented</FieldLabel></View>
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
              <Text style={st.addLink} accessibilityRole="button" onPress={() => addTeam(s)}>+ Add team</Text>
            </Card>
          );
        })}

        <FormError message={error} />
        <Button label={busy ? 'Saving…' : asAdmin ? 'Save details' : 'Save profile'} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** A phone / email already on file: shown, not editable (admin mode). */
function OnFile({ label }: { label: string }) {
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <FieldLabel>{label}</FieldLabel>
      <Text style={[textStyles.body, st.onFile]}>✓ On file</Text>
    </View>
  );
}

const st = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing(4) },
  onFile: { color: theme.colors.textMuted, paddingVertical: theme.spacing(2) },
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
  ageHint: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  requiredNote: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
});
