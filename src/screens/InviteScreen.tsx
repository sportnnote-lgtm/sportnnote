/**
 * app.sportnnote.in/i/<playerId> — where an invite (WhatsApp/SMS) lands.
 * Someone added to a team by their mobile number signs up RIGHT HERE with that
 * number (SMS code, no password) and is placed in the team automatically: phone
 * sign-up claims the provisional player that number was added as.
 * "Not you?" (…?notme=1) asks to confirm before anything is recorded — chat apps
 * open links to build previews, so opening the page must never report anyone.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from '../components/ui';
import { Logo } from '../components/Logo';
import { PhoneLoginCard } from '../components/PhoneLoginCard';
import { phoneLoginAvailable } from '../core/phoneLogin';
import { promptSignIn } from '../core/guest';
import { useAuth } from '../core/auth';
import { APP_INSTALL_URL } from '../core/invite';
import type { RootStackParamList } from '../navigation/types';

type Info = { team: string; teamId: string | null; claimed: boolean };
const FN = process.env.EXPO_PUBLIC_SUPABASE_URL ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1` : null;

export default function InviteScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Invite'>>();
  const { authed } = useAuth();
  const [info, setInfo] = useState<Info | null>(null);
  const [notMe, setNotMe] = useState(params.notme === '1');
  const [reported, setReported] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  useEffect(() => {
    let on = true;
    if (!FN) { setInfo({ team: 'your team', teamId: null, claimed: false }); return; }
    fetch(`${FN}/join?p=${encodeURIComponent(params.playerId)}&format=json`)
      .then((r) => r.json() as Promise<Info>)
      .then((d) => on && setInfo(d))
      .catch(() => on && setInfo({ team: '', teamId: null, claimed: false }));
    return () => { on = false; };
  }, [params.playerId, authed]);

  const report = async () => {
    setReported('busy');
    try {
      if (FN) {
        const r = await fetch(`${FN}/report-invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: params.playerId }) });
        if (!r.ok) throw new Error(String(r.status));
      }
      setReported('done');
    } catch { setReported('error'); }
  };

  const team = info?.team || 'a team';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View style={st.brand}><Logo size={56} /></View>

        {reported === 'done' ? (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Thanks — noted</Text>
            <Text style={textStyles.body}>We’ve told the organiser this number isn’t you. You won’t be added or signed up for anything. You can close this page.</Text>
          </Card>
        ) : authed ? (
          <Card style={{ gap: theme.spacing(3) }}>
            <Text style={textStyles.h2}>{info?.claimed ? `✓ You’re in ${team}` : 'You’re signed in'}</Text>
            <Text style={textStyles.body}>
              {info?.claimed
                ? 'Your spot is confirmed — your matches and stats with the team are on your profile.'
                : `If this invite was sent to the number you signed in with, you’ll appear in ${team} shortly. If it was sent to a different number of yours, sign in with that one.`}
            </Text>
            {info?.teamId ? <Button label={`Open ${team}`} onPress={() => nav.replace('Team', { teamId: info.teamId! })} /> : null}
            <Button label="Go to SportnNote" variant="ghost" onPress={() => nav.replace('Tabs', { screen: 'Home' })} />
          </Card>
        ) : (
          <>
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={st.title}>You’ve been added to {team} 🏆</Text>
              <Text style={textStyles.body}>Sign up with the mobile number this invite was sent to — you’ll be placed in the team automatically. It takes a minute and needs no password.</Text>
            </View>
            {phoneLoginAvailable()
              ? <PhoneLoginCard />
              : <Button label="Sign up" onPress={() => promptSignIn('up')} />}
            <Text style={st.link} accessibilityRole="link" onPress={() => void Linking.openURL(APP_INSTALL_URL)}>Prefer the Android app? Download it from sportnnote.in ›</Text>
          </>
        )}

        {reported !== 'done' && !info?.claimed && (
          notMe ? (
            <Card style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.h3}>Not you?</Text>
              <Text style={textStyles.body}>If this number isn’t yours or you didn’t expect this, tell us. The organiser is told, and you won’t be added or signed up for anything.</Text>
              <Button label={reported === 'busy' ? 'Sending…' : 'Yes — this isn’t me'} variant="ghost" onPress={() => void report()} disabled={reported === 'busy'} />
              {reported === 'error' ? <Text style={st.err}>Couldn’t send that just now — try again.</Text> : null}
            </Card>
          ) : (
            <Text style={st.muted} accessibilityRole="button" onPress={() => setNotMe(true)}>Not you? Didn’t expect this?</Text>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4), maxWidth: 520, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', marginTop: theme.spacing(2) },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center' },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600', textAlign: 'center' },
  err: { color: theme.colors.danger, fontSize: theme.font.small },
});
