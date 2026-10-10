import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SportId } from '../core/types';

export type RootStackParamList = {
  /** mode: open on Create account ('up') or Sign in ('in') — guest prompts. */
  Auth: { mode?: 'up' | 'in' } | undefined;
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
    /** the open tab / "Add scorer" panel — kept in params so they survive an iPhone
     *  background unload (the nav state is saved and restored) */
    tab?: string;
    addScorer?: boolean;
  };
  MatchSquad: {
    matchId: string; side: 'home' | 'away'; teamName: string; sport: SportId; playersPerSide?: number;
    // The team id — lets the picker add/invite players straight to this team's squad.
    teamId?: string;
    // Carried so the picker can hand off to the optional positional editor.
    homeTeamName?: string; awayTeamName?: string; homeColor?: string; awayColor?: string;
    // Which sides the viewer may edit (a captain = own side only); forwarded to the pitch editor.
    editableSides?: ('home' | 'away')[];
    /** players who've already taken part — shown "played", can't be benched (parity #13) */
    lockedIds?: string[];
  };
  CreateTournament: { sport?: SportId; orgId?: string } | undefined;
  CreateCommunity: undefined;
  DiscoverOrgs: undefined;
  Teams: undefined;
  /** cloneOf: a match id to copy (parity #13) — always a friendly, kicks off now */
  ScheduleMatch: { tournamentId?: string; sport?: SportId; cloneOf?: string } | undefined;
  CreateSeries: { tournamentId?: string; sport?: SportId } | undefined;
  Series: { seriesId: string };
  EditMatch: { matchId: string };
  GenerateFixtures: { tournamentId: string; sport?: SportId };
  /** bulk schedule import from a spreadsheet (parity #24) */
  ImportSchedule: { tournamentId: string };
  AssignScorers: { tournamentId: string };
  TournamentTeams: { tournamentId: string; sport?: SportId };
  Contingents: { tournamentId: string };
  Americano: { tournamentId: string; sport: SportId };
  /** with tournamentId: edits and SAVES that tournament's sport directly (parity #08) */
  SportSettings: { sport: SportId; tournamentId?: string };
  OrganizerDashboard: undefined;
  NotificationPrefs: undefined;
  Settings: undefined;
  Support: undefined;
  /** Privacy Policy / Terms (public: /privacy, /terms). */
  Legal: { doc: 'privacy' | 'terms' };
  Feedback: undefined;
  /** Short share link /m/<matchId> → resolves to LiveScoring. */
  MatchLink: { matchId: string };
  /** Invite landing (app.sportnnote.in/i/<id>): sign up with the invited number. */
  Invite: { playerId: string; notme?: string };
  DeleteAccount: undefined;
  /** In-app messaging (migration 0027). */
  Messages: undefined;
  /** threadId = an existing conversation; playerId = message this player (resumes
   *  or starts). viaGuardian: the player is under 18, so it goes to their guardian. */
  Conversation: { threadId?: string; playerId?: string; title?: string; viaGuardian?: boolean; readOnly?: boolean };
  GuardianLink: undefined;
  /** Support: reported-message queue (migration 0027). */
  MessageReports: undefined;
  /** Golf (field event) — a round's scorecard + leaderboard, and its setup. */
  GolfRound: { eventId: string };
  /** competition/holes are primitives so the web URL round-trips (no objects). */
  GolfRoundSetup: { tournamentId?: string; nextOf?: string; competition?: string; holes?: string } | undefined;
  /** Results engine (SD-28): one phase of a timed / measured event — entry + sheet. */
  ResultsEvent: { phaseId: string; tab?: 'enter' | 'sheet' };
  /** Hidden dev entry point for the results engine (URL /ResultsLab only). */
  ResultsLab: undefined;
  TryNewSport: { sports?: SportId[] } | undefined;
  PlayerProfile: { playerId: string };
  SportProfile: { playerId: string; sport: SportId };
  /** asAdmin (parity #12): a manager editing an unclaimed player they added or run.
   *  On web it may come back from the URL as the string 'true'. */
  EditProfile: { playerId: string; asAdmin?: boolean };
  VerificationReview: undefined;
  CreateListing: undefined;
  Following: undefined;
  Standings: { sport?: SportId; tournamentId?: string } | undefined;
  SportHub: { tournamentId: string; sport: SportId; tournamentName?: string };
  Bracket: { tournamentId?: string; sport?: SportId } | undefined;
  Team: { teamId: string };
  Squad: { teamId: string };
  /** correct a finished match (parity #05) */
  CorrectMatch: { matchId: string; sport: SportId };
  EditTeam: { teamId: string };
  JoinTournament: { token?: string } | undefined;
  JoinTeam: { token?: string } | undefined;
  /** The multi-sport "Team" (Club) system. Clubs = my teams list; CreateClub =
   *  the simple create flow; ClubHome = the team dashboard; ClubSport = one sport's
   *  profile (captain/VC, squad, roles). See migration 0018. */
  Clubs: undefined;
  CreateClub: { orgId?: string } | undefined;
  ClubHome: { clubId: string };
  ClubSport: { clubId: string; sport: SportId };
  JoinClub: { token?: string } | undefined;
  ScanQR: undefined;
  /** tab: open on a tab (e.g. 'Settings' right after creating it) */
  Tournament: { tournamentId: string; tab?: string };
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
    /** players who've already batted/bowled/fielded — can't be removed (parity #13) */
    lockedIds?: string[];
  };
};

export type TabParamList = {
  Home: undefined;
  /** Optional entry state when opened via a "See all" link. */
  Matches: { initialTab?: 'live' | 'upcoming' | 'completed'; initialSport?: SportId } | undefined;
  Organize: undefined;
  /** mode: 'people' is Search (key kept for saved URLs); focus: put the cursor in
   *  the search box (Home 🔍); in: the open result tab (parity #22). */
  Discover: { mode?: 'connect' | 'people'; focus?: boolean; in?: 'all' | 'players' | 'teams' | 'matches' | 'tournaments' } | undefined;
  Profile: undefined;
};
