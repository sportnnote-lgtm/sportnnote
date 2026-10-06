/**
 * Privacy Policy / Terms of Use. Reachable signed in (Settings) and signed out
 * (sign-up form), and publicly at /privacy and /terms on the web app.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Markdown } from '../components/Markdown';
import { PRIVACY_POLICY, TERMS } from '../data/legal';
import type { RootStackParamList } from '../navigation/types';

export default function LegalScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Legal'>>();
  const content = params?.doc === 'terms' ? TERMS : PRIVACY_POLICY;
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <Markdown content={content} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), paddingBottom: theme.spacing(10), maxWidth: 720, width: '100%', alignSelf: 'center' },
});
