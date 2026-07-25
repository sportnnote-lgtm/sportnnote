import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SportId } from '../core/types';

export type RootStackParamList = {
  Auth: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  LiveScoring: {
    sport: SportId;
    homeName: string;
    awayName: string;
    /** full team names (rosters & opponent labels); falls back to short names */
    homeTeamName?: string;
    awayTeamName?: string;
    homeColor?: string;
    awayColor?: string;
    /** when present (and Supabase configured), scores persist & broadcast live */
    matchId?: string;
    /** false for viewers — read-only scoreboard */
    canScore?: boolean;
  };
  MatchSquad: {
    matchId: string; side: 'home' | 'away'; teamName: string; sport: SportId; playersPerSide?: number;
    // The team id — lets the picker add/invite players straight to this team's squad.
    teamId?: string;
    // Carried so the picker can hand off to the optional positional editor.
    homeTeamName?: string; awayTeamName?: string; homeColor?: string; awayColor?: string;
  };
  CreateTournament: { sport?: SportId; orgId?: string } | undefined;
  CreateCommunity: undefined;
  Teams: undefined;
  ScheduleMatch: { tournamentId?: string; sport?: SportId } | undefined;
  GenerateFixtures: { tournamentId: string; sport?: SportId };
  OrganizerDashboard: undefined;
  NotificationPrefs: undefined;
  Settings: undefined;
  TryNewSport: { sports?: SportId[] } | undefined;
  PlayerProfile: { playerId: string };
  SportProfile: { playerId: string; sport: SportId };
  EditProfile: { playerId: string };
  VerificationReview: undefined;
  CreateListing: undefined;
  Following: undefined;
  Standings: { sport?: SportId; tournamentId?: string } | undefined;
  SportHub: { tournamentId: string; sport: SportId; tournamentName?: string };
  Bracket: { sport?: SportId } | undefined;
  Team: { teamId: string };
  Squad: { teamId: string };
  JoinTeam: { token?: string } | undefined;
  Tournament: { tournamentId: string };
  Organization: { orgId: string };
  Notifications: undefined;
  Calendar: undefined;
  LineupEditor: {
    matchId: string;
    sport: SportId;
    homeTeamName: string;
    awayTeamName: string;
    homeColor?: string;
    awayColor?: string;
  };
  CricketLineup: {
    matchId: string;
    sport: SportId;
    homeTeamName: string;
    awayTeamName: string;
    homeColor?: string;
    awayColor?: string;
    playersPerSide?: number;
  };
};

export type TabParamList = {
  Home: undefined;
  /** Optional entry state when opened via a "See all" link. */
  Matches: { initialTab?: 'live' | 'upcoming' | 'completed'; initialSport?: SportId } | undefined;
  Organize: undefined;
  Discover: undefined;
  Profile: undefined;
};
