/**
 * Short share link target: app.sportnnote.in/m/<matchId>. Looks the match up
 * and replaces itself with the full match page, so shared links stay short.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { textStyles, Button } from '../components/ui';
import { getMatch } from '../data/repos';
import type { RootStackParamList } from '../navigation/types';

export default function MatchLinkScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'MatchLink'>>();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let on = true;
    getMatch(params.matchId).then((m) => {
      if (!on) return;
      if (!m) { setMissing(true); return; }
      nav.replace('LiveScoring', {
        matchId: m.id,
        sport: m.sport,
        homeName: m.homeTeam.shortName,
        awayName: m.awayTeam.shortName,
        homeTeamName: m.homeTeam.name,
        awayTeamName: m.awayTeam.name,
        homeColor: m.homeTeam.colorHex,
        awayColor: m.awayTeam.colorHex,
      });
    }).catch(() => on && setMissing(true));
    return () => { on = false; };
  }, [nav, params.matchId]);

  return (
    <View style={st.wrap}>
      {missing ? (
        <>
          <Text style={textStyles.h3}>Match not found</Text>
          <Text style={[textStyles.muted, { textAlign: 'center' }]}>It may have been removed, or the link is incomplete.</Text>
          <Button label="Go to Home" onPress={() => nav.navigate('Tabs', { screen: 'Home' })} />
        </>
      ) : (
        <ActivityIndicator color={theme.colors.primary} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(6), gap: theme.spacing(3) },
});
