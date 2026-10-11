/** Create a community — a school, company, housing society, hospital chain, etc.
 *  Pick a standard type or enter a custom one. Once created, the community can
 *  host recurring sports events year after year (all tracked under it). */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { PhoneField } from '../components/PhoneField';
import { useAuth } from '../core/auth';
import { getMyPlayerId, createOrganization } from '../data/repos';
import { COMMUNITY_TYPES, isAcademicCommunity, suggestedGraduatingStandard } from '../core/org';
import { MARKETS, MARKET_ORDER, marketForCountry, type MarketId } from '../core/markets';
import { useRegion } from '../core/region';
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
  // SD-153: the school system (market) starts from the creator's region; it
  // prefills the graduating class, which a school confirms here (no silent
  // "Grade 10" outside India).
  const region = useRegion();
  const [market, setMarket] = useState<MarketId>(() => marketForCountry(region.country));
  const [gradStd, setGradStd] = useState(() => suggestedGraduatingStandard(marketForCountry(region.country)));
  const [gradTouched, setGradTouched] = useState(false);
  const [showMarkets, setShowMarkets] = useState(false);
  const pickMarket = (m: MarketId) => { setMarket(m); if (!gradTouched) setGradStd(suggestedGraduatingStandard(m)); };

  const resolvedType = typeChoice === CUSTOM ? customType.trim() : typeChoice;
  const academic = isAcademicCommunity(resolvedType);

  async function submit() {
    if (!name.trim()) return setError('Give the community a name.');
    if (typeChoice === CUSTOM && !customType.trim()) return setError('Describe the community type.');
    if (academic && !gradStd.trim()) return setError('Which class do students graduate after? Type it, e.g. Year 13 or Grade 12.');
    setError(null);
    setBusy(true);
    try {
      const org = await createOrganization(
        {
          name: name.trim(), type: resolvedType || undefined, city: city.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined,
          market,
          graduatingStandard: academic ? gradStd.trim() : undefined,
        },
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

        {academic && (
          <>
            <FieldLabel>School system</FieldLabel>
            <View style={st.chips}>
              {(showMarkets ? MARKET_ORDER : [market]).map((m) => (
                <SelectChip key={m} label={`${MARKETS[m].flag} ${MARKETS[m].name}`} active={market === m} onPress={() => pickMarket(m)} />
              ))}
              {!showMarkets && <SelectChip label="Change…" active={false} onPress={() => setShowMarkets(true)} />}
            </View>
            <Text style={textStyles.muted}>Sets class names, age groups and the age cut-off for your events. You can change it later.</Text>
            <TextField label="Graduating class (students leave after this)" value={gradStd} onChange={(v) => { setGradTouched(true); setGradStd(v); }} placeholder={suggestedGraduatingStandard(market)} autoCapitalize="words" />
            {MARKETS[market].graduating.length > 1 && (
              <View style={st.chips}>
                {MARKETS[market].graduating.map((g) => (
                  <SelectChip key={g} label={g} active={gradStd.trim() === g} onPress={() => { setGradTouched(true); setGradStd(g); }} />
                ))}
              </View>
            )}
          </>
        )}

        <TextField label="City" value={city} onChange={setCity} placeholder="Bengaluru" />
        <View style={st.wrapRow}>
          <View style={st.wrapCell}><TextField label="Email" value={email} onChange={setEmail} placeholder="sports@…" autoCapitalize="none" /></View>
          <View style={st.wrapCell}><PhoneField label="Phone" value={phone} onChange={setPhone} optional /></View>
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
  // Phone + email pairs: side by side when there's room, stacked on a phone.
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
  wrapCell: { flexGrow: 1, flexBasis: 220, minWidth: 0 },
  flex: { flex: 1 },
});
