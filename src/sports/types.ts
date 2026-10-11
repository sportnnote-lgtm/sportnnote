/**
 * The SportPlugin contract — this is what makes the app "multi-sport".
 *
 * The core platform (profiles, tournaments, schedules, the live-scoring screen)
 * knows NOTHING about how any individual sport is scored. Each sport ships a
 * plugin that provides:
 *   - a pure `reducer` (state + action -> new state)  ... the scoring rules
 *   - a `summary` projection                          ... what to show big on screen
 *   - a `ScoringControls` component                   ... the scorer's buttons
 *
 * Add a new sport = add one plugin + register it. The core never changes.
 * Because the reducer is pure, the SAME scoring logic runs on-device for an
 * optimistic update and (later) on the server to validate — no divergence.
 */
import type React from 'react';
import type { LineupSlot, Player, SportId } from '../core/types';
import type { CourtProps } from '../components/CourtMap';

/** Coarse scoring families — handy for grouping UI and reasoning about rules. */
export type ScoringArchetype =
  | 'goal-time' // football: goals over a running clock
  | 'set-game-point' // badminton/tennis: best-of sets
  | 'running-points' // basketball/volleyball: points by period/set
  | 'raid' // kabaddi: raid & tackle points, timed halves
  | 'measured' // athletics/golf: times/distances/strokes ranked on a leaderboard
  | 'result'; // chess: one recorded result per game (win/draw/loss + how)

/** Player stat credit carried alongside a scoring action (a side-channel the
 *  reducer ignores; the live-match layer turns it into a stat line). */
export interface Attribution {
  playerId: string;
  stat: string;
  by?: number;
  playerName?: string;
  /** extra stat increments credited in the same action, e.g. a shot on target
   *  is {shotsOnTarget: 1} on top of stat:'shots'. */
  extra?: Record<string, number>;
  /** stat keys being tracked this match (scorer's per-game settings) — stamped
   *  on the player's stat line so profiles can show per-stat game coverage. */
  tracked?: string[];
}

/** A scoring event. `type` is sport-defined; payload is open. */
export interface ScoreAction {
  type: string;
  side?: 'home' | 'away';
  payload?: Record<string, unknown>;
  /**
   * Optional player attribution. When present, the live-match layer writes a
   * stat line crediting `stat += by` to this player — so profiles update
   * straight from live scoring. The reducer ignores this (it only affects the
   * scoreboard via `type`/`side`); attribution is a side-channel.
   */
  attribution?: Attribution;
  /** A SECOND player credited by the same action — e.g. a caught wicket credits
   *  the bowler (attribution) AND the fielder's catch (attribution2). Persisted
   *  in the event payload so undo reverses it too. */
  attribution2?: Attribution;
}

/** Context a sport's voice parser gets: the live state, team names and rosters
 *  (so "point home", a team name, or a player's surname all resolve). */
export interface VoiceContext {
  state: unknown;
  homeName: string;
  awayName: string;
  homeRoster: Player[];
  awayRoster: Player[];
}

/** What the big scoreboard renders, regardless of sport. */
export interface ScoreSummary {
  homeScore: string;
  awayScore: string;
  /** e.g. "Q3 · 07:12", "Set 2", "1st Half", "Final" */
  statusLine: string;
  /** small detail line, e.g. "Set scores: 21-18, 19-21" */
  detailLine?: string;
  /** red cards per team — shown as badges next to the team name (football) */
  homeReds?: number;
  awayReds?: number;
}

export interface ScoringControlsProps<S> {
  state: S;
  /** Dispatch a scoring action; the screen applies it via the reducer. */
  dispatch: (action: ScoreAction) => void;
  homeName: string;
  awayName: string;
  /** Team kit colours, so the scorer's home/away controls match the teams. */
  homeColor?: string;
  awayColor?: string;
  /** Team rosters for player attribution (may be empty if unknown). */
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** Lineups (with positions) — lets sports award position-based stats. */
  homeLineup?: LineupSlot[];
  awayLineup?: LineupSlot[];
  /** Cricket: pre-match designated wicket-keeper per side (from the batting-order
   *  editor) — pre-fills the live match setup so the scorer doesn't re-pick it. */
  homeKeeperId?: string;
  awayKeeperId?: string;
}

/**
 * Optional rich, viewer-visible widget a sport can render on the live match
 * page beneath the scoreboard (e.g. football's pitch map). The generic screen
 * stays sport-agnostic; only plugins that set this render anything.
 */
export interface LiveExtrasProps {
  /** current match state (sport-specific shape) — for clocks, timelines, etc. */
  state: unknown;
  matchId?: string;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  homeLineup?: LineupSlot[];
  awayLineup?: LineupSlot[];
  /** when the plugin declares `liveViews`, which one to render (e.g. 'lineups') */
  view?: string;
  /** optional team managers/coaches (shown in the lineups view) */
  homeManager?: string;
  awayManager?: string;
  /** the formation each side lines up in, e.g. "4-2-3-1" */
  homeFormation?: string;
  awayFormation?: string;
  /** Per-side edit rights: a match runner (host/scorer) may edit both; a captain
   *  may edit only their own side. Drives which team's "edit lineup" button shows. */
  canEditHome?: boolean;
  canEditAway?: boolean;
  onEditLineup?: (side: 'home' | 'away') => void;
  /** tap a player's name anywhere in the live views → their profile */
  onPlayer?: (playerId: string) => void;
  /** dispatch + write permission, for post-match actions like Player of the Match */
  dispatch?: (action: ScoreAction) => void;
  canScore?: boolean;
}

/** Props for a sport-supplied scoreboard replacement. */
export interface ScoreboardProps {
  state: unknown;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  /** match is in progress (not yet complete) */
  live?: boolean;
  /** SD-20 — a match closed by hand (retired / default / abandoned): the board
   *  reads as final (no highlighted set, the winner's row marked) with the mark
   *  ("ret.") in the status line, even though the state never ended. */
  closed?: { mark: string | null; winner?: 'home' | 'away' };
}

/** Props for a sport's post-match summary (best performers, ratings, MVP). */
export interface SummaryProps {
  state: unknown;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  onPlayer?: (playerId: string) => void;
  /** set when the match was closed by hand (parity #04): the final word, which
   *  replaces the sport's own result line and LIVE treatment */
  manualResultLine?: string;
  /** the stored Player of the Match override (matches.potm, parity #21) — it
   *  beats the legacy cricket `s.potm` and the computed MVP (resolvePotm) */
  potm?: { id: string; name: string; changed: boolean };
}

/**
 * A configurable format setting a sport exposes to organizers (e.g. cricket
 * overs, football players-a-side or substitution rules). The format editor
 * renders these generically; the chosen values flow into createInitialState.
 */
export interface FormatFieldOption {
  /** Boolean is allowed because some rules read best as a labelled either/or
   *  rather than an on/off switch — tennis "Advantage / No-ad", badminton's
   *  golden point, volleyball's cap. Matches `default`'s type. */
  value: number | string | boolean;
  label: string;
  /** For a `preset` field: the sibling field values this option snaps to (e.g.
   *  T20 → { overs: 20, ballsPerOver: 6, powerplayOvers: 6 }). Applied on pick. */
  set?: Record<string, number | string | boolean>;
}

export interface FormatField {
  key: string;
  label: string;
  /** number = free numeric input; choice = labelled options; count = a min..max
   *  picklist (players per side, substitutes…); toggle = on/off (e.g. cricket's
   *  impact player); preset = a named version (T20, Futsal, 3×3…) that snaps the
   *  sibling fields via each option's `set`, with a "Custom" option to reveal them. */
  type: 'number' | 'choice' | 'count' | 'toggle' | 'preset';
  /** also shown inline on the tournament form's "{Sport} basics" (parity #09);
   *  every `preset` field is shown there anyway */
  onCreate?: boolean;
  default: number | string | boolean;
  /** For a 'preset' field: the default when the format is seeded for a
   *  TOURNAMENT (e.g. pickleball: side-out, as sanctioned events play). Absent →
   *  `default`. One-off matches always use `default`. */
  tournamentDefault?: number | string | boolean;
  /** for 'choice' and 'preset' */
  options?: FormatFieldOption[];
  /** for 'number' and 'count' */
  min?: number;
  max?: number;
  hint?: string;
  /** Granular fields flagged advanced are hidden behind the preset until the user
   *  picks "Custom" or taps "Customize". Non-advanced fields always show. */
  advanced?: boolean;  /** Toggles that share a group render as one chip row under this heading
   *  (parity #14's live settings, e.g. football's "Stats captured"). */
  group?: string;
  /** For a 'number' field in the live settings card: render a −step / +step
   *  stepper (clamped to min/max) instead of a text input. */
  step?: number;
}

export type FormatValue = number | string | boolean;

/**
 * Settings a scorer may change on a live match (parity #14) — the ONLY per-match
 * settings mechanism (REVIEW Decision 2). Rendered by LiveSettingsCard.
 *  - mode 'config': each change patches `matches.format` at once and the log is
 *    replayed with it (football's stats-captured toggles, half length).
 *  - mode 'event': before play (`beforeStart`) a change patches the format
 *    (the new baseline); after it, Apply dispatches `actionType` with the patch,
 *    so it applies from the next play and past plays keep their rules.
 */
export interface LiveSettings<S = unknown> {
  title: string;
  /** one line under the title */
  hint?: string;
  fields: FormatField[];
  /** current values keyed by field key */
  read: (state: S) => Record<string, FormatValue>;
  /** true = no play yet (patch the format). Default: eventCount === 0. */
  beforeStart?: (state: S) => boolean;
  mode: 'event' | 'config';
  actionType?: string;
  /** "standard" values — drive the Standard / N custom pill and Reset */
  defaults?: Record<string, FormatValue>;
}

/** SD-19 — one player's absolute figures for a match (`SportPlugin.statTotals`). */
export interface StatTotalsEntry {
  side: 'home' | 'away';
  stats: Record<string, number>;
  /** doubles: the partner's player id (derived; not stored on the line — a
   *  stat line has no column for it, so readers pair lines by match + side) */
  partnerId?: string;
}

/** SD-19 — what the data layer knows about a match that the state may not:
 *  the players each side fielded (matchday squad, else a 1–2 player entry's
 *  roster), with names so name-only events (older logs) resolve to ids. */
export interface StatTotalsContext {
  players?: { home: { id: string; name?: string }[]; away: { id: string; name?: string }[] };
}

export interface SportPlugin<S = unknown> {
  id: SportId;
  name: string;
  /** emoji placeholder until real icons are added */
  icon: string;
  archetype: ScoringArchetype;
  /**
   * The structure of a competing side, which drives how a match/tournament is set
   * up (who you pick as the two sides):
   *   - 'team' (default): two teams with rosters — football, cricket, basketball…
   *   - 'individual': each side is one person — an individual sport with no team
   *     concept in setup.
   *   - 'both': a sport that is individual in Singles and a pair in Doubles (the
   *     racket sports). Which one applies at setup time is read from the
   *     `playersPerSide` format value (1 = Singles/individual, ≥2 = Doubles/pair).
   * Omitted = 'team' (backward compatible).
   */
  participantKind?: 'team' | 'individual' | 'both';
  /** Fresh match state. `config` lets a tournament tweak rules (e.g. sets to win). */
  createInitialState: (config?: Record<string, unknown>) => S;
  /** PURE scoring logic. Never mutate `state`; return a new object. */
  reducer: (state: S, action: ScoreAction) => S;
  /** Projection for the universal scoreboard. */
  summary: (state: S) => ScoreSummary;
  /** SD-01 — set/game sports: the per-set line of the COMPLETED sets/games
   *  ("21-18, 19-21, 21-15"; tennis "6-4, 3-6, 7-6(4)"), '' before the first one
   *  ends. `perspective: 'away'` reads it from the away side (history rows). Must
   *  tolerate a stored snapshot (`matches.state`) from an older engine version. */
  scoreLine?: (state: S, perspective?: 'home' | 'away') => string;
  /** SD-20 — set/game sports: the line score as data (completed sets/games, the
   *  one in play, sets/games won) → the LineScoreboard grid and a retirement's
   *  "6-4, 3-2 ret." (`matchScoreLine` in scoreline.ts). Tolerates old snapshots. */
  lineScore?: (state: S) => import('./scoreline').LineScore | null;
  /** SD-56 — a short line under the score on the match card for a live or
   *  finished match (football "HT 1-0"). '' = none. Tolerates old snapshots. */
  cardLine?: (state: S) => string;
  /** SD-20 — mark a match closed by hand the ITF / BWF / ITTF way: "ret." (retired
   *  = Conceded), "def." (default = Awarded), "w/o", "abandoned"; and label the
   *  End-match chips Retired / Default. Racket sports. */
  retireTerms?: boolean;
  /** Has the match reached its end condition? */
  isComplete: (state: S) => boolean;
  /** The decided outcome once the match is complete: the winning side (or 'draw')
   *  plus a numeric score per side for standings (goals / points / games / sets /
   *  runs). Returns null while the match is undecided or still in progress. This
   *  is the single source of truth the data layer uses to persist a match result
   *  (winner + score) and each player's win — never parse the display summary. */
  result?: (state: S) => { winner: 'home' | 'away' | 'draw'; home: number; away: number } | null;
  /** Rate denominators for a rate-based league tie-break — cricket returns the
   *  overs faced by each side (a side bowled out counts its full quota), which
   *  drives Net Run Rate. Sports without a rate omit this. */
  standingsRate?: (state: S) => { home: number; away: number } | null;
  /** Rate denominators for a match ended by hand (parity #04, "Count in NRR —
   *  all overs"): cricket charges BOTH sides their full `oversLimit`. Same shape
   *  as `standingsRate`; the standings use it instead when `match.result` is set. */
  manualRate?: (state: S) => { home: number; away: number } | null;
  /** Runs each side is credited with in the table's for / against and the rate
   *  (SD-13), when they differ from `result`'s score — cricket's ICC NRR rule
   *  for a chase to a revised target (side batting first = target − 1). Null =
   *  use the score. Not used for a match ended by hand. */
  standingsScore?: (state: S) => { home: number; away: number } | null;
  /** End-match-by-hand dialog (parity #04): what the level result is called
   *  ("Draw" by default, cricket "Tie") and whether to offer the NRR toggle. */
  manualEnd?: { drawLabel: string; nrrToggle?: boolean };
  /** Can a finished match be corrected with the generic list (parity #05)? false
   *  hides "Correct this match" — cricket until #06 ships its own editor, since
   *  re-crediting `attribution` alone would split its scorecard from its stats. */
  correctable?: boolean;
  /** A sport's own correction editor (cricket, #06); else the generic list. */
  CorrectionEditor?: React.FC<{
    log: import('../core/types').MatchEventRecord[];
    config?: Record<string, unknown>;
    ops: import('./amend').AmendOp[];
    onOps: (ops: import('./amend').AmendOp[], lines: string[]) => void;
    homeName: string; awayName: string;
    homeRoster: Player[]; awayRoster: Player[];
  }>;
  /** Rally points won by each side over the match (every game's points) — the
   *  ITTF "points ratio" league tie-break. Rally sports supply it. */
  standingsPoints?: (state: S) => { home: number; away: number } | null;
  /** SD-17 standings rule kit: what the table's set / point ratio, games
   *  difference / % and fair-play tie-breakers read — sets, games and rally
   *  (or board) points won by each side, and each side's fair-play score (≤ 0).
   *  Give only what the match score doesn't already count (volleyball's score
   *  is sets, badminton's games); `standingsPoints` stands in for `points`. */
  standingsUnits?: (state: S) => import('../data/standings').StandingsUnits | null;
  /** The scorer's control panel for this sport. */
  ScoringControls: React.FC<ScoringControlsProps<S>>;
  /** Optional rich widget shown on the live page (e.g. football pitch map). */
  LiveExtras?: React.FC<LiveExtrasProps>;
  /** Optional live widget rendered inside the scoreboard (e.g. a match clock). */
  LiveClock?: React.FC<{ state: unknown }>;
  /**
   * Optional full replacement for the universal scoreboard. Sports whose score
   * doesn't fit the symmetric "home : away" layout (e.g. cricket's innings-by-
   * innings board) render their own; the live screen uses this when present.
   */
  Scoreboard?: React.FC<ScoreboardProps>;
  /** Suppress the top scoreboard (e.g. cricket, whose scorecard shows the score). */
  hideScoreboard?: boolean;
  /** The sport renders its own lineups inside LiveExtras (e.g. football's LINEUPS
   *  sub-tab), so the live screen skips the generic court to avoid duplication. */
  lineupsInExtras?: boolean;
  /**
   * Optional content views the plugin contributes as their own top-level tabs on
   * the live screen (e.g. football → Lineups / Stats / Timeline). The live screen
   * renders each by calling `LiveExtras` with that view's `key`. When omitted, the
   * sport keeps the single combined "Score" tab.
   */
  liveViews?: { key: string; label: string }[];
  /**
   * Optional post-match summary (best performances, MVP, per-player ratings).
   * Sports without one fall back to the generic stat-line summary; either way
   * the live screen splits into Info / Score / Summary tabs.
   */
  Summary?: React.FC<SummaryProps>;
  /** With a Summary: the Player of the Match it shows when there is no stored
   *  override (legacy name, then its computed MVP) — the "old" side of the
   *  change-POTM confirm (parity #21). */
  autoPotm?: (state: S) => { id?: string; name: string } | undefined;
  /** Organizer-configurable format options for this sport. */
  formatFields?: FormatField[];
  /** Settings changeable on a live match (parity #14); see LiveSettings. */
  liveSettings?: LiveSettings<S>;
  /**
   * Optional hands-free scoring. `parse` is a PURE function mapping a spoken (or
   * typed) phrase to the action(s) to dispatch, or null if unrecognised; `hints`
   * are example phrases shown to the scorer. Sports that set this get the shared
   * VoiceScorer panel on the live screen. (Football ships its own richer flow.)
   */
  voice?: {
    hints: string[];
    parse: (text: string, ctx: VoiceContext) => ScoreAction[] | null;
  };
  /**
   * Optional positional layout. `formation(perSide?)` is a fresh, unfilled
   * one-side template (x/y normalised), sized to the team's players-per-side when
   * given; `Court` renders the sport's court/field with both teams' lineups.
   * Sports that set these get a visual lineup editor + map.
   */
  formation?: (perSide?: number) => LineupSlot[];
  Court?: React.FC<CourtProps>;
  /** Extra tiles for the in-play Quick options sheet (parity #13) — e.g.
   *  cricket's 🧤 Change keeper. `onDone(message)` closes the sheet and shows
   *  the message as a short toast. */
  QuickOptions?: React.FC<QuickOptionsProps>;
  /** Players who have already taken part (parity #13): they can't be removed
   *  from the matchday squad. Omitted → anyone with a non-zero stat line. */
  involvedPlayerIds?: (state: S) => string[];
  /** Parity #19 / SD-19 — the ABSOLUTE per-player figures for this match, keyed
   *  by the player id recorded in the state (`side` = the team they played for).
   *  When present, completion and corrections sync stat lines to these values
   *  (`repos.syncMatchStatLines`: ids mapped through resolved disputes, values
   *  SET not added, only changed rows written) instead of relying on the live
   *  read-then-write increments alone (which two scorers or a retried upload
   *  can lose or double).
   *
   *  THE CONTRACT (checked for every implementing sport by
   *  tests/stat-totals-contract.test.mts via tests/statTotalsHarness.mts):
   *   1. PURE and derived only from the state (+ the optional `ctx`): the same
   *      log always gives the same totals, and an old log replays identically.
   *   2. For every key the totals return that is also credited live (the
   *      `attribution` / `extra` / `attribution2` of dispatched actions, incl.
   *      STAT_ADJUST), the value equals the SUM of those live increments for a
   *      log with no corrections — per player, zeros included.
   *   3. It survives corrections: after an EDIT_LOG, an AMEND (#05) or an undo
   *      (any prefix of the log), the totals still equal the live sum of the
   *      effective log, and equal the totals of the same match scored cleanly.
   *   4. An owned key (one the totals return for ANY player) that a player
   *      lacks reads as 0 — the sync zeroes a stale value there (SD-29). So
   *      leave a key out of every player only when it is unknown (cricket's
   *      maidens without a ball log), never just for one player.
   *   5. Keys only the totals can know (games / sets won, deciders, minutes…)
   *      are "derived" keys: never credited live, always ≥ 0.
   *   6. Without `statTotalsPartial`, every key credited live must be owned
   *      (a correction then writes no deltas — the sync sets everything).
   *  `ctx` (SD-19) gives the players each side fielded, for engines whose state
   *  doesn't know them (the racket sports): a side's record keys go to every
   *  player in it, and name-only point events resolve to ids. Optional — with
   *  no ctx, the players credited in the log are used. */
  statTotals?: (state: S, ctx?: StatTotalsContext) => Record<string, StatTotalsEntry>;
  /** SD-19 — `statTotals` wants `ctx.players` (the data layer loads the
   *  match's squads / entry rosters first). Absent = called with the state only
   *  (cricket, football: unchanged). */
  statTotalsNeedsPlayers?: boolean;
  /** SD-09 — `statTotals` covers only SOME keys (football: the keeper's clean
   *  sheets, goals conceded and minutes). The keys it returns are synced
   *  absolutely; every other stat keeps moving by live increments and #05
   *  correction deltas. Absent = the totals own the whole line (cricket). */
  statTotalsPartial?: boolean;
  /** SD-15 (GEN-02) — the sport's declarative stat schema: keys, labels,
   *  formats, aggregation, box / career / leaders / awards / MVP weights. Set
   *  for every sport by the registry from `statSchemas.ts` (pure, so the data
   *  layer reads it there without importing plugins). */
  statSchema?: import('./statSchema').SportStatSchema<SportId>;
  /** Parity #19 — the state to persist in `matches.state` (e.g. cricket drops
   *  its derived ball log, which replay rebuilds). Omitted = the state as is. */
  snapshot?: (state: S) => S;
  /** Parity #25 — richer score-ticker cells (batters, bowler, this over…),
   *  merged over the summary by `buildTicker`. `names` = the short team names. */
  tickerDetail?: (state: S, names: { home: string; away: string }) => import('./ticker').TickerDetail;
  /** Parity #25 — the overlay's big-moment banner for the newest event (a
   *  wicket, a four, a goal), or null. Only called on a realtime INSERT. */
  tickerFlash?: (prev: S, next: S) => import('./ticker').TickerFlash | null;
}

/** Props for a sport's Quick-options tiles. */
export interface QuickOptionsProps {
  state: unknown;
  dispatch: (a: ScoreAction) => void;
  homeRoster: Player[];
  awayRoster: Player[];
  homeName: string;
  awayName: string;
  onDone: (message?: string) => void;
  /** SD-53 — end the match by hand through the screen's Match controls path
   *  (a manual result, e.g. a racket default: kind 'awarded' = "Default").
   *  The caller asks first (askConfirm). Absent → the tile can't end it. */
  onEndMatch?: (r: { kind: 'awarded'; winner: 'home' | 'away'; reason: string }) => void;
}
