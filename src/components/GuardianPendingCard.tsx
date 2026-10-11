/**
 * SD-152 — Home card for an under-18 account outside India whose parent/guardian
 * hasn't confirmed yet (or withdrew). The first time it's seen it sends the
 * confirmation email by itself; "Details" opens Settings → Your data & privacy.
 * Renders nothing for everyone else (India, adults, confirmed accounts, demo).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from './ui';
import { useAuth } from '../core/auth';
import { getMyPrivacyStatus, requestGuardianConsent, type PrivacyStatus } from '../data/privacy';
import type { RootStackParamList } from '../navigation/types';

export function GuardianPendingCard() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile, demo } = useAuth();
  const [status, setStatus] = useState<PrivacyStatus | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    if (demo || !profile) return;
    let on = true;
    void getMyPrivacyStatus().then(async (s) => {
      if (!on || !s?.limited) return;
      setStatus(s);
      // First sight of a pending account: send the guardian the link right away.
      if (s.guardianConsent === 'pending' && !s.pendingRequestSentAt && !autoSent.current) {
        autoSent.current = true;
        const r = await requestGuardianConsent();
        if (on && r.sent) setSentTo(r.email ?? s.guardianEmailHint ?? 'your parent/guardian');
      }
    }).catch(() => {});
    return () => { on = false; };
  }, [profile?.id, demo]);

  if (!status?.limited) return null;
  const withdrawn = status.guardianConsent === 'withdrawn';
  return (
    <Card style={st.card}>
      <View style={{ gap: theme.spacing(1) }}>
        <Text style={textStyles.h3}>{withdrawn ? '🔒 Your account is locked' : '👪 Waiting for your parent or guardian'}</Text>
        <Text style={textStyles.muted}>
          {withdrawn
            ? 'Your parent or guardian withdrew consent. Ask them to confirm again, or the account is deleted after 30 days.'
            : sentTo
              ? `We emailed ${sentTo} a link to confirm your account. Until then, following and messages are off.`
              : 'A parent or guardian needs to confirm your account. Until then, following and messages are off.'}
        </Text>
      </View>
      <Button label="Details" variant="ghost" onPress={() => nav.navigate('Privacy')} />
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), borderColor: theme.colors.accent },
});
