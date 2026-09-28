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
    // Which sides the viewer may edit (a captain = own side only); forwarded to the pitch editor.
    editableSides?: ('home' | 'away')[];
  };
  CreateTournament: { sport?: SportId; orgId?: string } | undefined;
  CreateCommunity: undefined;
  Teams: undefined;
  ScheduleMatch: { tournamentId?: string; sport?: SportId } | undefined;
  CreateSeries: { tournamentId?: string; sport?: SportId } | undefined;
  Series: { seriesId: string };
  EditMatch: { matchId: string };
  GenerateFixtures: { tournamentId: string; sport?: SportId };
  TournamentTeams: { tournamentId: string; sport?: SportId };
  Contingents: { tournamentId: string };
  Americano: { tournamentId: string; sport: SportId };
  SportSettings: { sport: SportId };
  OrganizerDashboard: undefined;
  NotificationPrefs: undefined;
  Settings: undefined;
  Support: undefined;
  TryNewSport: { sports?: SportId[] } | undefined;
  PlayerProfile: { playerId: string };
  SportProfile: { playerId: string; sport: SportId };
  EditProfile: { playerId: string };
  VerificationReview: undefined;
  CreateListing: undefined;
  Following: undefined;
  Standings: { sport?: SportId; tournamentId?: string } | undefined;
  SportHub: { tournamentId: string; sport: SportId; tournamentName?: string };
  Bracket: { tournamentId?: string; sport?: SportId } | undefined;
  Team: { teamId: string };
  Squad: { teamId: string };
  JoinTeam: { token?: string } | undefined;
  /** The multi-sport "Team" (Club) system. Clubs = my teams list; CreateClub =
   *  the simple create flow; ClubHome = the team dashboard; ClubSport = one sport's
   *  profile (captain/VC, squad, roles). See migration 0018. */
  Clubs: undefined;
  CreateClub: { orgId?: string } | undefined;
  ClubHome: { clubId: string };
  ClubSport: { clubId: string; sport: SportId };
  JoinClub: { token?: string } | undefined;
  Tournament: { tournamentId: string };
  EditTournament: { tournamentId: string };
  Organization: { orgId: string };
  Notifications: undefined;
  Calendar: undefined;
  LineupEditor: {
    matchId: string;
    sport: SportId;
    /** team size — sizes the pitch + which formations are offered (7-a-side etc.) */
    playersPerSide?: number;
    homeTeamName: string;
    awayTeamName: string;
    homeColor?: string;
    awayColor?: string;
    /** Sides the viewer may edit. A captain gets only their own side (no opponent
     *  tab); omitted/both for match runners. */
    editableSides?: ('home' | 'away')[];
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
