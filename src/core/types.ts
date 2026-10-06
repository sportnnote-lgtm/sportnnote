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
  | 'squash'
  | 'tabletennis'
  | 'chess'
  | 'carrom'
  | 'golf';

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
  /** the person reported (via the "not me" invite link) that this provisional
   *  identity isn't them. Flagged to the organizer + blocked from further use. */
  reported?: boolean;
  /** parent/guardian contact — for young players who don't have their own phone
   *  or email. The guardian typically creates and manages the profile. Optional. */
  guardian?: GuardianContact;
  /** age + guardian-relationship proof, reviewed by the support team */
  verification?: IdVerification;
  /** profile photo (image URI) */
  photoUrl?: string;
  /** position & handedness per sport the player plays */
  sportDetails?: Partial<Record<SportId, SportDetail>>;
  /** Age in years, derived server-side. Live reads of other people return this
   *  instead of `dob` (which is private) — use ageOf(p) rather than reading either. */
  age?: number;
  /** Privacy opt-ins (adults only; default off): show my mobile / email publicly. */
  showPhone?: boolean;
  showEmail?: boolean;
  /** a parent/guardian has linked their own account (gets messages about this player) */
  guardianLinked?: boolean;
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
  /** Live reads of SOMEONE ELSE's minor (players_view, migration 0026): the
   *  guardian's name/phone/email are private, so only these status flags come
   *  back — `present` says a guardian is on file. */
  hidden?: boolean;
  present?: boolean;
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
  /** the submitted document (image/PDF) file name */
  docName?: string;
  /** storage path of the uploaded document in the private `verification-docs`
   *  bucket (live mode) — the reviewer signs it to view. Absent in demo mode. */
  docPath?: string;
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
/**  - Owner: full control incl. managing other Owners & transferring ownership;
 *     an org must always keep at least one Owner.
 *  - Admin: manage everything EXCEPT Owners (can't add/remove/demote an Owner).
 *  - Organizer: create & run tournaments; no org-wide administration.
 *  - Scorer / Referee: eligible to be ASSIGNED to score/officiate specific events
 *     (org role = eligibility; the actual duty is a per-tournament assignment).
 *  - Member: a participating member — view the community & their own matches. */
export type OrgRole = 'Owner' | 'Admin' | 'Organizer' | 'Scorer' | 'Referee' | 'Member';

/** An organization membership request — either an invite the org sent a person, or
 *  a join-request a person sent the org. Membership is only created on accept. */
export type OrgRequestDirection = 'invite' | 'request';
export type OrgRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
export interface OrgRequest {
  id: UUID;
  orgId: UUID;
  /** the person being invited / requesting to join (player id) */
  playerId: UUID;
  direction: OrgRequestDirection;
  /** the role granted on accept (for an invite the org chose it; a request defaults to Member) */
  role: OrgRole;
  status: OrgRequestStatus;
  /** who created it (player id): the inviter for an invite, the requester for a request */
  by?: UUID;
  message?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: UUID;
}

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
  /** The student's House over time (schools). Independent of class & teams; a
   *  timeline so a past tournament shows the House they were in at that date. */
  houses?: HouseStint[];
}

/** A span of time a student spent in one class/standard. Half-open: the stint
 *  covers [since, until); the current class has no `until`. */
export interface GradeStint {
  /** class/standard label, e.g. "Grade 9", "Class X", "Year 1" */
  standard: string;
  since: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD; absent ⇒ current class
}

/** A House a school defines (Red/Blue/…). Houses are a school-level list; a student
 *  belongs to a House independently of their class and their teams (a team may mix
 *  students from different Houses — see spec §20–21). */
export interface House {
  name: string;
  colorHex?: string;
}

/** A span of time a student belonged to one House. Mirrors GradeStint so a past
 *  tournament shows the House the student was in AT THE TIME (history preserved). */
export interface HouseStint {
  house: string;
  since: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD; absent ⇒ current House
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
  /** For schools: the Houses the school has (Red/Blue/…). A managed list; students
   *  are assigned to one of these (independently of class & teams). */
  houses?: House[];
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
  /** the match this line came from ('' for a field-event line — see eventId) */
  matchId: UUID;
  /** field events (a golf round…): the event this line came from */
  eventId?: UUID;
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
  /** the multi-sport Club this row is the sport profile of, if any. A Club owns one
   *  Team row per sport it plays; this back-reference ties them together. Absent for
   *  standalone / legacy / ad-hoc teams. See Club. */
  clubId?: UUID;
  /** explicit roster (player ids). When set, it overrides the implicit
   *  house-name roster derivation; absent ⇒ roster derived from houseName. */
  roster?: UUID[];
  /** created on the fly (e.g. a one-off side for a friendly). De-emphasised in
   *  "Manage teams" so ad-hoc teams don't clutter the real houses/clubs. */
  adhoc?: boolean;
}

/* ------------------------------- Clubs (teams) ---------------------------- */
// A Club is one real-world team entity that can play MANY sports — what the UI
// simply calls a "Team". It is the PARENT of the per-sport `Team` rows above:
// each sport a club plays has its own Team row (its "sport profile"), carrying
// that sport's captain/vice-captain (TeamLeadership), squad (roster) and player
// roles (TeamPlayerRoles). So one club → one identity, many independent sport
// configurations. Team-level administration (admins/members) is separate from
// sport-specific leadership. See migration 0018.

export interface Club {
  id: UUID;
  name: string;
  shortName: string;
  logoUrl?: string;
  colorHex?: string;
  city?: string;
  about?: string;
  contactPhone?: string;
  contactEmail?: string;
  /** the community/organization the club was created within, if any */
  orgId?: UUID;
  /** profile id of whoever created the club */
  createdBy?: UUID;
}

/** A new club to create (id assigned on insert). */
export interface NewClub {
  name: string;
  shortName: string;
  logoUrl?: string;
  colorHex?: string;
  city?: string;
  about?: string;
  contactPhone?: string;
  contactEmail?: string;
  orgId?: UUID;
  /** profile id of the creator (stored on the club row). */
  createdBy?: UUID;
  /** player id of the creator when they add themselves — becomes the first member
   *  and thus an admin. Distinct from createdBy, which is a profile id. */
  firstMemberPlayerId?: UUID;
  /** sports the club plays at creation (a per-sport Team row is minted for each). */
  sports?: SportId[];
}

/** Team-level role, sport-agnostic. 'admin' can manage the club, its members,
 *  sports and settings; 'member' just belongs. The first member added to a new
 *  club becomes an admin automatically. Distinct from sport captaincy. */
export type ClubMemberRole = 'admin' | 'member';

export interface ClubMember {
  clubId: UUID;
  playerId: UUID;
  role: ClubMemberRole;
  joinedAt?: string;
}

/** A club membership joined to the person's player record — for display lists. */
export interface ClubMemberView extends ClubMember {
  player: Player;
}

/** A shareable invite to JOIN a club as a member — redeemed via a link/code. */
export interface ClubInvite {
  token: string;
  clubId: UUID;
  clubName?: string;
}

/** Sport-specific roles a player holds within one team's sport profile, e.g.
 *  cricket ['Wicketkeeper','Batter'] or football ['Defender']. Keyed to the
 *  per-sport Team row, so a player's role in one sport never affects another
 *  sport's role. The catalogue of valid roles per sport lives in data/teamRoles. */
export interface TeamPlayerRoles {
  teamId: UUID;
  playerId: UUID;
  roles: string[];
}

/** A team's participation in a tournament is a lifecycle, not a boolean:
 *  'confirmed' = in (only these count toward format/fixtures); 'invited' = the
 *  organizer invited the team, awaiting the captain's acceptance; 'pending' =
 *  the captain requested to join, awaiting organizer approval. See migration 0007. */
export type TournamentEntryStatus = 'confirmed' | 'invited' | 'pending' | 'withdrawn';
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

/** Who a tournament is contested by (see Tournament.participation). */
export type TournamentParticipation = 'open' | 'inter_house' | 'school_team' | 'individual';

/** A person explicitly assigned to officiate a specific tournament. The org-level
 *  Scorer/Referee role is only ELIGIBILITY; this is the actual per-event duty (§9). */
export type OfficialRole = 'scorer' | 'referee';
export interface TournamentOfficial {
  tournamentId: UUID;
  playerId: UUID;
  role: OfficialRole;
  assignedBy?: UUID;
  at?: string;
}

/** A tournament's ownership at a point in time — either an individual (the host
 *  player ids) or an organization. Ownership can be transferred between the two;
 *  the creator is retained separately (Tournament.createdBy). */
export type OwnerRef = { kind: 'individual'; playerIds: UUID[] } | { kind: 'org'; orgId: UUID };

/** One entry in a tournament's ownership audit trail (created / transferred). Names
 *  are snapshotted so history stays readable even if an org is later renamed/removed. */
export interface OwnershipEvent {
  id: UUID;
  tournamentId: UUID;
  action: 'created' | 'transferred';
  fromKind?: 'individual' | 'org';
  fromName?: string;
  toKind: 'individual' | 'org';
  toName?: string;
  byPlayerId?: UUID;
  byName?: string;
  at: string;
}

/** A single entry in the activity/audit trail (spec §27) — a traceable record of a
 *  meaningful change to an org or tournament (member joined/left/role-changed,
 *  official assigned, ownership transferred…). Names are snapshotted for readability. */
export interface ActivityEvent {
  id: UUID;
  scope: 'org' | 'tournament';
  refId: UUID; // the org id or tournament id this is about
  action: string; // e.g. 'member.joined' | 'member.left' | 'member.role' | 'official.assigned' | 'official.unassigned'
  detail?: string; // human-readable summary
  byPlayerId?: UUID;
  byName?: string;
  at: string;
}

export interface Tournament {
  id: UUID;
  name: string;
  hostName: string; // display name of the host (a person or an organization)
  /** the player who originally created this tournament — retained even after the
   *  tournament is transferred to an organization or another owner ("Created by"). */
  createdBy?: UUID;
  /** How this tournament is contested (spec §25) — the tournament defines its own
   *  participation, independent of the underlying team/house/student structure:
   *  'open' teams (default), 'inter_house' (a school's Houses compete), 'school_team'
   *  (the school's own team), or 'individual' (players enter individually). */
  participation?: TournamentParticipation;
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
  /** registration closes at this instant — after it, new requests are blocked */
  registrationDeadline?: string;
  /** minimum teams for a viable field (organizer heads-up when below it) */
  minTeams?: number;
  /** capacity — once this many teams are entered, registration is full */
  maxTeams?: number;
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
  /** Medal/position scoring for a multi-sport meet. When `mode` is 'position',
   *  the overall table sums points earned by each contingent's finishing position
   *  in every sport (Olympics / inter-school style) instead of match points. */
  scoring?: TournamentScoring;
}

export interface TournamentScoring {
  /** 'match' = overall table sums league points (default); 'position' = medal meet. */
  mode: 'match' | 'position';
  /** points for finishing 1st, 2nd, 3rd, … (index 0 = 1st). Position beyond the
   *  list scores 0. */
  positionPoints?: number[];
  /** optional per-sport multiplier on the position points (default 1 each). */
  sportWeights?: Partial<Record<SportId, number>>;
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
  /** server insert time; present when read back (used to find kickoff). */
  created_at?: string;
}

export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled';

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
  /** decided without being played — a walkover (the absent side forfeits). Counts
   *  as a normal win/loss in the tables, but is shown as "w/o" not a score. */
  walkover?: boolean;
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
  /** The PRIMARY scorer's player id (kept for reminders/notifications). Maps to
   *  `scorer_id` on the backend. Prefer `scorerIds` for "can this player score". */
  scorerId?: UUID;
  /** Everyone allowed to score this match from their device (player ids). More than
   *  one person can share scoring duties. Maps to `scorer_ids` on the backend;
   *  `scorerId` is the first of these. */
  scorerIds?: UUID[];
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

/* ----------------------------- Field events ------------------------------ */
// N participants, one leaderboard (golf stroke play / Stableford; later athletics,
// swimming…). Lives ALONGSIDE head-to-head matches — see docs/sports/GOLF_DESIGN.md.

export type FieldEventStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';

/** One round / heat / session. A multi-round tournament = several events with
 *  the same tournamentId (roundNo 1, 2, …). A casual round has no tournament. */
export interface FieldEvent {
  id: UUID;
  tournamentId?: UUID;
  sport: SportId;
  title: string;
  roundNo: number;
  startsAt: string;
  status: FieldEventStatus;
  /** sport-specific format (golf: scoring, holes, allowance, courseId, tee…) */
  format: Record<string, unknown>;
  /** player ids who manage this event (besides the tournament's managers) */
  hostIds?: UUID[];
  createdBy?: UUID;
}

export type FieldEntryStatus = 'playing' | 'finished' | 'dnf' | 'wd' | 'dq';

/** One participant in one event. `result` is the sport's payload (golf: the card). */
export interface FieldEntry {
  id: UUID;
  eventId: UUID;
  playerId: UUID;
  /** playing group (golf 3/4-ball), 1-based */
  groupNo: number;
  teeTime?: string;
  startHole?: number;
  /** golf: the player's WHS Handicap Index at the time (self-entered snapshot) */
  handicapIndex?: number;
  result: unknown;
  status: FieldEntryStatus;
  updatedAt?: string;
}

/** A golf course: holes (par + stroke index) and tees (rating + slope). */
export interface GolfCourse {
  id: UUID;
  name: string;
  city?: string;
  holes: { n: number; par: number; si: number }[];
  tees: { name: string; courseRating?: number; slope?: number; rating9F?: number; slope9F?: number; rating9B?: number; slope9B?: number }[];
  createdBy?: UUID;
}
