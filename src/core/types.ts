/**
 * Shared domain types — the "core" platform model that every sport reuses.
 * These mirror the Postgres tables in /supabase/schema.sql. Per-sport scoring
 * data lives in `Match.state` (typed by each sport plugin), NOT here.
 */

export type UUID = string;

export type SportId =
  | 'football'
  | 'cricket'
  | 'basketball'
  | 'badminton'
  | 'tennis'
  | 'volleyball'
  | 'kabaddi'
  | 'pickleball'
  | 'padel'
  | 'squash';

/** `support` is the internal support/admin role — it can review verification
 *  documents and has every organizer/scorer capability (a superset). */
export type Role = 'organizer' | 'scorer' | 'player' | 'parent' | 'fan' | 'support';

export interface Profile {
  id: UUID;
  fullName: string;
  handle: string;
  avatarUrl?: string;
  role: Role;
  schoolId?: UUID;
  /** date of birth (YYYY-MM-DD) — captured at sign-up, mandatory */
  dob?: string;
}

/** A team the player has represented in a sport, with the jersey they wore there
 *  (teams & numbers differ per sport / tournament / game). */
export interface TeamStint {
  name: string;
  jersey?: number;
  /** when the player joined this team (YYYY-MM-DD). */
  since?: string;
  /** when the player left (YYYY-MM-DD); absent ⇒ still a current team. */
  until?: string;
}

/** Per-sport details a player sets on their own profile. Dominant-side choices
 *  are keyed by dimension because a sport can have several (cricket = batting
 *  hand AND bowling arm, tennis = playing hand AND backhand, …). */
export interface SportDetail {
  /** position/role in that sport, e.g. "Striker", "Opening batter", "Setter" */
  position?: string;
  /** dominant-side selections keyed by dimension (foot / bat / bowl / hand …) */
  sides?: Record<string, string>;
  /** teams represented in this sport (each with its own jersey) */
  teams?: TeamStint[];
}

export interface Player {
  id: UUID;
  profileId?: UUID; // a player may exist before claiming an account
  fullName: string;
  jerseyNo?: number;
  sports: SportId[];
  houseName?: string; // team/club/house affiliation, e.g. "Red House"
  houseColor?: string;
  city?: string; // home city/community — powers discovery across schools
  /** self-described gender (free-form; UI offers common options + "prefer not to say") */
  gender?: string;
  /** a short "about me" the player writes for their profile */
  bio?: string;
  /** date of birth (YYYY-MM-DD); age is derived for display */
  dob?: string;
  /** contact details the player maintains on their own profile */
  phone?: string;
  email?: string;
  /** whether each contact has been confirmed via OTP (the channel used at
   *  sign-up is verified; the other can be verified from the profile) */
  phoneVerified?: boolean;
  emailVerified?: boolean;
  /** An organizer-invited prospective player: shown on the team sheet as
   *  "pending" until they install + register (claim this record). Not eligible to
   *  be scored until then. Drives the invite-to-install growth loop. */
  invited?: boolean;
  /** parent/guardian contact — for young players who don't have their own phone
   *  or email. The guardian typically creates and manages the profile. Optional. */
  guardian?: GuardianContact;
  /** age + guardian-relationship proof, reviewed by the support team */
  verification?: IdVerification;
  /** profile photo (image URI) */
  photoUrl?: string;
  /** position & handedness per sport the player plays */
  sportDetails?: Partial<Record<SportId, SportDetail>>;
}

/** Parent/guardian contact for a young player. Phone & email are verified the
 *  same way as a player's own (OTP). */
export interface GuardianContact {
  name: string;
  phone?: string;
  email?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  /** ISO timestamp when the guardian affirmed consent for the under-18 account.
   *  The compliance artifact for minors — captured at sign-up, carried in the
   *  guardian jsonb on profiles/players. */
  consentedAt?: string;
}

/** Document-backed verification of age (and that the guardian is genuine),
 *  reviewed and approved by the internal support team. */
/** One immutable entry in a verification's history (compliance log). */
export interface VerificationEvent {
  action: 'submitted' | 'approved' | 'rejected';
  at: number;
  /** the support reviewer (approve/reject) */
  byId?: string;
  byName?: string;
  /** document name (on submit) or the rejection reason */
  note?: string;
  docName?: string;
}

export interface IdVerification {
  status: 'pending' | 'approved' | 'rejected';
  /** the submitted document (image/PDF) name or URI */
  docName?: string;
  /** ms epoch when submitted */
  submittedAt?: number;
  /** support note on rejection */
  note?: string;
  /** audit trail of the latest decision: who reviewed it and when */
  reviewedAt?: number;
  reviewedById?: string;
  reviewedByName?: string;
  /** append-only history of every submit/approve/reject — oldest → newest. */
  history?: VerificationEvent[];
}

/**
 * A "Connect" noticeboard post — the marketplace where players find teams,
 * teams find players, and teams find opponents or grounds. Anyone interested
 * reaches out via the shared contact / WhatsApp.
 */
export type ListingKind =
  | 'player_seeking_team' // a player wants to join a team
  | 'team_seeking_player' // a team needs a player (often a position)
  | 'team_seeking_opponent' // a team wants a match
  | 'team_seeking_ground'; // a team is looking for a venue

export interface Listing {
  id: UUID;
  kind: ListingKind;
  sport: SportId;
  /** poster's player id (for "my posts" / removal) */
  authorId?: UUID;
  /** who's posting — a person's name, or the team's name for team posts */
  authorName: string;
  /** team name for team_* kinds */
  teamName?: string;
  /** the player's position/abilities, or the position a team needs */
  position?: string;
  city?: string;
  /** free-text description of what they're after */
  details: string;
  /** opponent / ground posts: when they want to play or need the ground
   *  (kept free-text — "Sat 21 Jun, 6 PM", "this weekend", …) */
  preferredDate?: string;
  /** opponent posts: level of play (Friendly / Competitive / Any level) */
  level?: string;
  /** number shared for reach-out (WhatsApp / call) */
  contactPhone?: string;
  /** whether the shared number was a verified contact when posted */
  contactVerified?: boolean;
  /** ISO timestamp */
  createdAt: string;
}

/** Roles a person can hold within an organization, in descending authority:
 *  - Admin: change anything about the community & its events; manage members,
 *    create teams & rosters, create/organize tournaments.
 *  - Organizer: create & schedule tournaments and matches; add/remove teams.
 *  - Scorer: score only the matches they are assigned to.
 *  - Member: view the community's tournaments and their own matches. */
export type OrgRole = 'Admin' | 'Organizer' | 'Scorer' | 'Member';

export interface OrgMember {
  playerId: UUID;
  role: OrgRole;
  /** when the player joined (YYYY-MM-DD) */
  since?: string;
  /** when the player left (YYYY-MM-DD); absent = still an active member. A player
   *  can be active in only one community per category at a time — joining a new
   *  one of the same category moves the previous to "past" (sets `until`). */
  until?: string;
  /** For academic communities (school/college): the student's class/standard
   *  over time. Each promotion adds a new stint, so we can resolve which class
   *  a student was in on any given date (e.g. during a past tournament). */
  grades?: GradeStint[];
}

/** A span of time a student spent in one class/standard. Half-open: the stint
 *  covers [since, until); the current class has no `until`. */
export interface GradeStint {
  /** class/standard label, e.g. "Grade 9", "Class X", "Year 1" */
  standard: string;
  since: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD; absent ⇒ current class
}

/**
 * An organization (school, club, academy, league body) that can host
 * tournaments. Its members run its events and all of them receive the host
 * notifications. Shows up on each member's profile.
 */
export interface Organization {
  id: UUID;
  name: string;
  /** community kind — a standard type (School, Company, …) or a custom label */
  type?: string;
  logoUrl?: string;
  city?: string;
  email?: string;
  phone?: string;
  bio?: string;
  members: OrgMember[];
  /** For schools/colleges: the academic years the community has run, each with
   *  real dates. Used to know the *current* running year, when the school
   *  started (earliest), and to drive the class rollover off the right dates. */
  academicYears?: AcademicYear[];
  /** The class after which students graduate & leave (India default "Grade 10").
   *  At rollover, students in this class graduate instead of being promoted. */
  graduatingStandard?: string;
}

/** One academic year with concrete dates (not a recurring template), e.g.
 *  { label: "2025–26", start: "2025-06-01", end: "2026-04-30" }. */
export interface AcademicYear {
  label: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

/**
 * One player's contribution to one match. `stats` is sport-defined numeric
 * counters (e.g. {goals:2, assists:1} or {points:18}). Rolling these up across
 * matches produces a player's profile totals — see src/data/stats.ts.
 */
export interface StatLine {
  id: UUID;
  matchId: UUID;
  playerId: UUID;
  sport: SportId;
  stats: Record<string, number>;
  won: boolean;
  /** opponent label for the history list, e.g. "Blue House" */
  opponent?: string;
  date?: string;
  /**
   * Which stat keys were *being tracked* in this match (per the scorer's per-game
   * scoring settings) — independent of whether this player recorded any. Lets a
   * profile say a total like "shots on target" spans fewer games than the player's
   * total. Absent on legacy lines → treat every standard stat as tracked.
   */
  tracked?: string[];
}

export interface Team {
  id: UUID;
  name: string;
  shortName: string;
  sport: SportId;
  colorHex?: string;
  /** the community/organization that owns this team, if created within one */
  orgId?: UUID;
  /** explicit roster (player ids). When set, it overrides the implicit
   *  house-name roster derivation; absent ⇒ roster derived from houseName. */
  roster?: UUID[];
  /** created on the fly (e.g. a one-off side for a friendly). De-emphasised in
   *  "Manage teams" so ad-hoc teams don't clutter the real houses/clubs. */
  adhoc?: boolean;
}

/** A team's participation in a tournament is a lifecycle, not a boolean:
 *  'confirmed' = in (only these count toward format/fixtures); 'invited' = the
 *  organizer invited the team, awaiting the captain's acceptance; 'pending' =
 *  the captain requested to join, awaiting organizer approval. See migration 0007. */
export type TournamentEntryStatus = 'confirmed' | 'invited' | 'pending';
export interface TournamentEntry {
  team: Team;
  status: TournamentEntryStatus;
  /** the division this entry belongs to (see TournamentCategory). Absent ⇒ the
   *  tournament's single/implicit division. */
  categoryId?: UUID;
}

/** A division within a tournament — the backbone of school meets: age group ×
 *  gender (U14 Boys, U16 Girls, Open Mixed…). A tournament with no categories
 *  behaves as one implicit division. See migration 0008. */
export type CategoryGender = 'boys' | 'girls' | 'mixed';
export interface TournamentCategory {
  id: UUID;
  tournamentId: UUID;
  /** display label, always set (e.g. 'U14 Boys' or a custom name) */
  label: string;
  /** structured age band, e.g. 'U14' (absent for a free-form custom division) */
  ageGroup?: string;
  gender?: CategoryGender;
  sort?: number;
}
/** A new division to attach to a tournament (id/tournamentId assigned on insert). */
export interface NewTournamentCategory {
  label: string;
  ageGroup?: string;
  gender?: CategoryGender;
  sort?: number;
}

/** Who leads a team — responsible for setting the matchday squad. */
/** A player's objection that their name/identity is being used in a match they
 *  aren't part of. While open, the disputed identity is masked ("X") and the
 *  scores stand aside until the captains agree who actually played. */
export interface MatchDispute {
  id: UUID;
  matchId: UUID;
  side: 'home' | 'away';
  /** the disputed identity — whose name was used */
  playerId: UUID;
  /** name snapshot (so it can still be referenced after masking) */
  playerName: string;
  reason?: string;
  /** objection = the player flags themselves (masks immediately); report = a peer
   *  flags someone else (notifies organizers, who decide whether to escalate). */
  kind: 'objection' | 'report';
  /** open = active & masking; reported = a peer's report awaiting organizer triage. */
  status: 'open' | 'reported' | 'resolved' | 'dismissed';
  /** who raised it (the player themselves for an objection; a peer for a report) */
  raisedBy: UUID;
  raisedByName?: string;
  raisedAt: string;
  /** proposed correct player to credit instead of the disputed name */
  replacementId?: UUID;
  replacementName?: string;
  /** both captains must confirm before a reassignment is applied */
  homeCaptainOk?: boolean;
  awayCaptainOk?: boolean;
  resolvedAt?: string;
  /** append-only audit trail: who did what, when — because a dispute can alter
   *  recorded results, every step is logged for accountability. */
  history?: DisputeEvent[];
}

/** One step in a dispute's audit trail. */
export interface DisputeEvent {
  action: 'raised' | 'reported' | 'escalated' | 'proposed' | 'confirmed' | 'resolved' | 'dismissed';
  /** ISO timestamp */
  at: string;
  byId?: UUID;
  byName?: string;
  /** human-readable detail, e.g. "home captain confirmed" or "reassigned to Aarav Mehta" */
  note?: string;
}

export interface TeamLeadership {
  captainId?: UUID;
  viceCaptainId?: UUID;
}

export interface Venue {
  id: UUID;
  name: string;
  location?: string;
}

/** Organizer-chosen settings for a sport, e.g. {overs: 10, playersPerSide: 8}. */
export type SportFormat = Record<string, number | string | boolean>;

/** How a tournament is decided based on team count. */
export type TournamentStructure = 'league' | 'knockout' | 'league_knockout';

export interface Tournament {
  id: UUID;
  name: string;
  hostName: string; // display name of the host (a person or an organization)
  /** when an organization hosts, its id — management & reminders span all its
   *  members. Absent for individually-hosted tournaments (see hostIds). */
  hostOrgId?: UUID;
  /** tournament logo/banner (image URI) the hosts can set */
  logoUrl?: string;
  /** The people who run this tournament (player ids). Any host can manage it and
   *  receives "no scorer assigned" reminders — multiple hosts avoid a single
   *  point of contact. Maps to `host_ids` on the backend. */
  hostIds?: UUID[];
  /** open for registration — listed in Discover so teams can request to join */
  isOpen?: boolean;
  sports: SportId[];
  startDate: string;
  endDate: string;
  /** per-sport format chosen by the organizer (overs, players/side, subs…) */
  formats?: Partial<Record<SportId, SportFormat>>;
  structure?: TournamentStructure;
  /** How knockout ties are decided (shown only when the structure has knockouts).
   *  `extra_time` = extra time then penalties (with the half length & extra subs
   *  below); `penalties` = straight to a shootout. Applied to knockout matches. */
  knockoutFormat?: {
    decider: 'extra_time' | 'penalties';
    /** minutes per extra-time half (decider = 'extra_time') */
    extraTimeMinutes?: number;
    /** extra substitutions allowed in extra time */
    extraTimeSubs?: number;
  };
  /** organizer's per-tournament reminder lead times (minutes before kickoff) for
   *  players in its matches. Overrides each player's own default; absent ⇒ every
   *  player uses their personal reminder settings. */
  reminderLeadMinutes?: number[];
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  /** ms epoch */
  at: number;
  /** deep-link targets — tapping the notification opens the relevant page */
  playerId?: string;
  matchId?: string;
  read: boolean;
}

/**
 * A spot in a team's formation. `x`/`y` are normalised pitch coordinates
 * (0..1): x left→right, y own-goal→opponent-goal. `position` is a code like
 * 'GK','CB','ST'. A slot may be unfilled (no player assigned yet).
 */
export interface LineupSlot {
  position: string;
  x: number;
  y: number;
  playerId?: string;
  playerName?: string;
  /** wears the captain's armband — shown as a "C" badge on the lineup */
  isCaptain?: boolean;
}

export interface MatchLineup {
  home: LineupSlot[];
  away: LineupSlot[];
  /** the formation each side lines up in, e.g. "4-2-3-1" / "3-4-2-1" */
  homeFormation?: string;
  awayFormation?: string;
}

/** The matchday squad for one team: who starts and who's on the bench. Works
 *  for every sport; the scoring roster is starters + subs. */
export interface MatchSquad {
  starters: string[]; // player ids — ordered (cricket uses this as the batting order)
  subs: string[];
  /** Cricket: the designated wicket-keeper (pre-fills live match setup). */
  keeperId?: string;
}
export interface MatchSquads {
  home: MatchSquad;
  away: MatchSquad;
}

/** Football-specific profile details a player adds to their profile. */
export interface FootballProfile {
  position?: string;
  foot?: 'Left' | 'Right' | 'Both';
  /** clubs/teams the player has represented */
  teams?: string[];
  bio?: string;
}

/**
 * One persisted scoring action in a match's append-only log. Replaying these
 * through a sport's pure reducer reconstructs the full live state — scoreboard,
 * clock and timeline — on any device. `attribution` is stored so viewers see
 * who scored, not just that a goal happened.
 */
export interface MatchEventRecord {
  seq: number;
  type: string;
  side?: 'home' | 'away' | null;
  payload?: Record<string, unknown> | null;
  attribution?: { playerId: string; stat: string; by?: number; playerName?: string; extra?: Record<string, number>; tracked?: string[] } | null;
}

export type MatchStatus = 'scheduled' | 'live' | 'completed';

export interface Match {
  id: UUID;
  /** the tournament this match belongs to — absent for an ad-hoc friendly */
  tournamentId?: UUID;
  /** group-stage label (e.g. "A", "B") for a grouped tournament; absent otherwise */
  group?: string;
  /** tournament phase — 'group' or a knockout round id ('r16' | 'qf' | 'sf' | 'final') */
  stage?: string;
  /** play-in round only: the top-seeded team ids that bye this round (they skip
   *  it and join its winners in the next round). Lets the bracket advance a
   *  play-in → a clean main round without phantom "bye" match records. */
  byes?: string[];
  sport: SportId;
  status: MatchStatus;
  startsAt: string;
  venueId?: UUID;
  venueName?: string;
  /** explicit Google Maps link for the venue; else derived from venueName */
  venueMapsUrl?: string;
  /** optional live-stream link (YouTube/Twitch/…); shown atop the live match */
  streamUrl?: string;
  /** final/running score (goals, runs or points) — drives for/against in tables */
  score?: { home: number; away: number };
  homeTeam: Team;
  awayTeam: Team;
  /** result of a completed match — drives standings */
  winner?: 'home' | 'away' | 'draw';
  /** format override for a one-off/friendly game (else inherits the tournament) */
  format?: SportFormat;
  /** Who created/owns this match (player ids). Any match host — and any host of
   *  its tournament — can manage it (assign the scorer, edit the XI) and gets
   *  "no scorer assigned" reminders. Maps to `host_ids` on the backend. */
  hostIds?: UUID[];
  /** match logo/banner (image URI) the hosts can set */
  logoUrl?: string;
  /** optional team managers/coaches — shown in the lineups view. Fully optional
   *  (local games often have none); set per side. */
  managers?: { home?: string; away?: string };
  /** The one device/person the organizer designates to score this match. Only
   *  that player's device shows the scoring controls; everyone else views.
   *  A player id; maps to `scorer_id` on the backend. */
  scorerId?: UUID;
  /** Sport-specific live state — shape defined by the sport's plugin. */
  state: unknown;
}

/** A shareable invite that lets a captain/coach claim a team and manage its squad. */
export interface TeamInvite {
  token: string;
  teamId: string;
  teamName: string;
  role: 'captain' | 'coach';
}

/** A house/team across sports — the unit you follow and see a profile for. */
export interface TeamSummary {
  id: string;
  name: string;
  colorHex?: string;
  sports: SportId[];
}
