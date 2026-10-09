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
  /** Parity #19 — the ABSOLUTE per-player figures for this match, keyed by the
   *  player id recorded in the state (`side` = the team they played for). When
   *  present, completion and corrections sync stat lines to these values
   *  (`repos.syncMatchStatLines`) instead of relying on live increments alone. */
  statTotals?: (state: S) => Record<string, { side: 'home' | 'away'; stats: Record<string, number> }>;
  /** Parity #19 — the state to persist in `matches.state` (e.g. cricket drops
   *  its derived ball log, which replay rebuilds). Omitted = the state as is. */
  snapshot?: (state: S) => S;
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
}
