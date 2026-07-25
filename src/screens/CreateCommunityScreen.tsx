/** Create a community — a school, company, housing society, hospital chain, etc.
 *  Pick a standard type or enter a custom one. Once created, the community can
 *  host recurring sports events year after year (all tracked under it). */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { getMyPlayerId, createOrganization } from '../data/repos';
import { COMMUNITY_TYPES } from '../core/org';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateCommunity'>;
const CUSTOM = 'Custom…';

export default function CreateCommunityScreen({ navigation }: Props) {
  const { profile } = useAuth();
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then((id) => on && setMyId(id));
    return () => { on = false; };
  }, [profile?.id]);

  const [name, setName] = useState('');
  const [typeChoice, setTypeChoice] = useState<string>(COMMUNITY_TYPES[0]);
  const [customType, setCustomType] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedType = typeChoice === CUSTOM ? customType.trim() : typeChoice;

  async function submit() {
    if (!name.trim()) return setError('Give the community a name.');
    if (typeChoice === CUSTOM && !customType.trim()) return setError('Describe the community type.');
    setError(null);
    setBusy(true);
    try {
      const org = await createOrganization(
        { name: name.trim(), type: resolvedType || undefined, city: city.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined },
        myId ?? undefined
      );
      // Replace this screen with the new community's page.
      navigation.replace('Organization', { orgId: org.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create community');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="New community" subtitle="A school, club, company… that runs sports events" />

        <TextField label="Name" value={name} onChange={setName} placeholder="Greenwood High School" />

        <FieldLabel>Type</FieldLabel>
        <View style={st.chips}>
          {COMMUNITY_TYPES.map((t) => (
            <SelectChip key={t} label={t} active={typeChoice === t} onPress={() => setTypeChoice(t)} />
          ))}
          <SelectChip label={CUSTOM} active={typeChoice === CUSTOM} onPress={() => setTypeChoice(CUSTOM)} />
        </View>
        {typeChoice === CUSTOM && (
          <TextField label="Custom type" value={customType} onChange={setCustomType} placeholder="e.g. Alumni association" />
        )}

        <TextField label="City" value={city} onChange={setCity} placeholder="Bengaluru" />
        <View style={st.row}>
          <View style={st.flex}><TextField label="Email" value={email} onChange={setEmail} placeholder="sports@…" autoCapitalize="none" /></View>
          <View style={st.flex}><TextField label="Phone" value={phone} onChange={setPhone} placeholder="+91…" autoCapitalize="none" /></View>
        </View>
        <Text style={textStyles.muted}>You'll be its first admin. Add members, a logo, and organize events from the community page.</Text>

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : 'Create community'} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
});
