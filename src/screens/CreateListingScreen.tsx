/** Post a Connect listing — looking for a team, a player, an opponent, or a
 *  ground. Fields adapt to the kind; contact prefills from your profile. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { SPORT_LIST, getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import { getMyPlayerId, getPlayer, createListing } from '../data/repos';
import { LISTING_KINDS, LISTING_LEVELS, wantsSchedule, wantsLevel } from '../core/connect';
import type { ListingKind, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateListing'>;

const isTeamKind = (k: ListingKind) => k !== 'player_seeking_team';
const wantsPosition = (k: ListingKind) => k === 'player_seeking_team' || k === 'team_seeking_player';
const positionLabel = (k: ListingKind) =>
  k === 'player_seeking_team' ? 'Your position / abilities' : 'Position needed';

export default function CreateListingScreen({ navigation }: Props) {
  const { profile } = useAuth();

  const [kind, setKind] = useState<ListingKind>('player_seeking_team');
  const [sport, setSport] = useState<SportId>('football');
  const [teamName, setTeamName] = useState('');
  const [position, setPosition] = useState('');
  const [city, setCity] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [level, setLevel] = useState('');
  const [details, setDetails] = useState('');
  const [phone, setPhone] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill contact + city from the poster's own profile.
  useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then(async (id) => {
      if (!on || !id) return;
      setMyId(id);
      const p = await getPlayer(id);
      if (!on || !p) return;
      setMyName(p.fullName);
      setPhone((cur) => cur || p.phone || '');
      setCity((cur) => cur || p.city || '');
      if (p.phoneVerified && p.phone) setVerifiedPhone(p.phone);
    });
    return () => {
      on = false;
    };
  }, [profile?.id]);

  // The shared number counts as verified only if it's the profile's verified phone.
  const contactVerified = !!verifiedPhone && phone.trim() === verifiedPhone;

  async function submit() {
    if (isTeamKind(kind) && !teamName.trim()) return setError('Enter your team name.');
    if (!details.trim()) return setError('Add a few details about what you’re looking for.');
    setError(null);
    setBusy(true);
    try {
      await createListing({
        kind,
        sport,
        authorId: myId ?? undefined,
        authorName: isTeamKind(kind) ? teamName.trim() : myName || 'A player',
        teamName: isTeamKind(kind) ? teamName.trim() : undefined,
        position: wantsPosition(kind) && position.trim() ? position.trim() : undefined,
        city: city.trim() || undefined,
        preferredDate: wantsSchedule(kind) && preferredDate.trim() ? preferredDate.trim() : undefined,
        level: wantsLevel(kind) && level ? level : undefined,
        details: details.trim(),
        contactPhone: phone.trim() || undefined,
        contactVerified,
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post listing');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Post a listing" subtitle="What are you looking for?" />

        <View style={st.chips}>
          {LISTING_KINDS.map((k) => (
            <SelectChip key={k.kind} label={`${k.icon} ${k.label}`} active={kind === k.kind} onPress={() => setKind(k.kind)} />
          ))}
        </View>

        <FieldLabel>Sport</FieldLabel>
        <View style={st.chips}>
          {SPORT_LIST.map((s) => (
            <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sport === s.id} onPress={() => setSport(s.id)} />
          ))}
        </View>

        {isTeamKind(kind) && (
          <TextField label="Team name" value={teamName} onChange={setTeamName} placeholder="e.g. Bengaluru Strikers" />
        )}
        {wantsPosition(kind) && (
          <TextField
            label={positionLabel(kind)}
            value={position}
            onChange={setPosition}
            placeholder={kind === 'player_seeking_team' ? 'e.g. Right-arm pacer, can bat' : 'e.g. Goalkeeper'}
          />
        )}
        <TextField label="City / area" value={city} onChange={setCity} placeholder="Bengaluru" />
        {wantsSchedule(kind) && (
          <TextField
            label={kind === 'team_seeking_ground' ? 'When do you need it?' : 'Preferred date / time'}
            value={preferredDate}
            onChange={setPreferredDate}
            placeholder="e.g. Sat 21 Jun, 6 PM"
          />
        )}
        {wantsLevel(kind) && (
          <View style={{ gap: theme.spacing(1) }}>
            <FieldLabel>Level of play</FieldLabel>
            <View style={st.chips}>
              {LISTING_LEVELS.map((lv) => (
                <SelectChip key={lv} label={lv} active={level === lv} onPress={() => setLevel(level === lv ? '' : lv)} />
              ))}
            </View>
          </View>
        )}
        <TextField
          label="Details"
          value={details}
          onChange={setDetails}
          placeholder={`What ${getSport(sport).name.toLowerCase()} ${isTeamKind(kind) ? 'your team needs' : 'you’re looking for'} — availability, level, timing…`}
          multiline
        />
        <TextField label="Contact number (WhatsApp)" value={phone} onChange={setPhone} placeholder="+91…" autoCapitalize="none" />
        <Text style={textStyles.muted}>
          Shared on the post so interested people can reach you.
          {phone.trim()
            ? contactVerified
              ? ' ✓ This is your verified number.'
              : ' This number isn’t verified — verify it in your profile to show a verified badge.'
            : ''}
        </Text>

        <FormError message={error} />
        <Button label={busy ? 'Posting…' : 'Post listing'} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
