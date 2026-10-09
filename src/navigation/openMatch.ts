/** Open a match for a viewer — the read-only live scoreboard. One helper so a
 *  match opened from a tournament page and from search behave the same. */
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Match } from '../core/types';
import type { RootStackParamList } from './types';

type MatchLike = Pick<Match, 'id' | 'sport' | 'homeTeam' | 'awayTeam'>;

export function openMatchViewer(nav: Pick<NativeStackNavigationProp<RootStackParamList>, 'navigate'>, m: MatchLike) {
  nav.navigate('LiveScoring', {
    matchId: m.id, sport: m.sport,
    homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
    homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
    homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
    canScore: false,
  });
}
