/**
 * Privacy Policy / Terms of Use. Reachable signed in (Settings) and signed out
 * (sign-up form), and publicly at /privacy and /terms on the web app.
 *
 * SD-152: region-aware. Users in India (and anyone we can't place) see the India
 * text, unchanged; users elsewhere see the international draft
 * (src/data/legal.ts). Either version can be opened from the other.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Markdown } from '../components/Markdown';
import { privacyPolicyFor, termsFor } from '../data/legal';
import { privacyCountry } from '../core/privacyRegion';
import type { RootStackParamList } from '../navigation/types';

export default function LegalScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Legal'>>();
  const [country, setCountry] = useState(() => (privacyCountry() === 'IN' ? 'IN' : 'INTL'));
  const content = params?.doc === 'terms' ? termsFor(country) : privacyPolicyFor(country);
  const other = country === 'IN' ? 'INTL' : 'IN';
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <Markdown content={content} />
        <Text style={st.switch} accessibilityRole="link" onPress={() => setCountry(other)}>
          {other === 'IN' ? 'Read the version for users in India' : 'Read the version for users outside India'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), paddingBottom: theme.spacing(10), maxWidth: 720, width: '100%', alignSelf: 'center' },
  switch: { color: theme.colors.primary, textDecorationLine: 'underline', marginTop: theme.spacing(6), fontSize: theme.font.small },
});
