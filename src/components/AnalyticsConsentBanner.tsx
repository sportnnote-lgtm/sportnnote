/**
 * SD-152 — first-visit analytics choice for the UK and GDPR countries
 * (core/privacyRegion.ts). Nothing is sent or stored for analytics until the
 * viewer picks; both buttons are the same size so saying no is as easy as yes.
 * Elsewhere this never shows (analytics is on with a notice; Settings → Your data
 * has the switch). Mounted once at the app root (App.tsx).
 */
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { theme } from '../core/theme';
import { Button, textStyles } from './ui';
import { needsAnalyticsBanner, setAnalyticsChoice, subscribeAnalyticsConsent } from '../core/analyticsConsent';
import { SITE_URL } from '../core/hosts';

export function AnalyticsConsentBanner() {
  const [show, setShow] = useState(needsAnalyticsBanner());
  useEffect(() => subscribeAnalyticsConsent(() => setShow(needsAnalyticsBanner())), []);
  if (!show) return null;
  return (
    <View style={st.wrap} pointerEvents="box-none">
      <View style={st.card} accessibilityRole="alert" accessibilityLabel="Analytics choice">
        <Text style={textStyles.h3}>Help us improve SportnNote?</Text>
        <Text style={textStyles.body}>
          With your OK we count which screens are opened and keep a random ID on this device, so we can see what works. No ads, no tracking across other sites, never sold.
        </Text>
        <Text style={textStyles.muted}>
          “Essential only” keeps just what the app needs to run (your sign-in and anonymous crash reports). You can change this any time in Settings → Your data & privacy.{' '}
          <Text style={st.link} accessibilityRole="link" onPress={() => { void Linking.openURL(`${SITE_URL}/privacy/`); }}>Privacy Policy</Text>
        </Text>
        <View style={st.row}>
          <Button label="Essential only" variant="ghost" style={st.btn} onPress={() => { void setAnalyticsChoice('denied'); }} />
          <Button label="Allow analytics" style={st.btn} onPress={() => { void setAnalyticsChoice('granted'); }} />
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: theme.spacing(4), alignItems: 'center' },
  card: {
    width: '100%', maxWidth: 560, gap: theme.spacing(2), padding: theme.spacing(4),
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  row: { flexDirection: 'row', gap: theme.spacing(2), marginTop: theme.spacing(1) },
  btn: { flex: 1 },
  link: { color: theme.colors.primary, textDecorationLine: 'underline' },
});
