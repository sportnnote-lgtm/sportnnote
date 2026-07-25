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
  | 'measured'; // athletics: times/distances ranked

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
  attribution?: {
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
  };
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
  /** organizer/scorer may edit the lineup before kickoff */
  canEdit?: boolean;
  onEditLineup?: () => void;
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
  default: number | string | boolean;
  /** for 'choice' and 'preset' */
  options?: FormatFieldOption[];
  /** for 'number' and 'count' */
  min?: number;
  max?: number;
  hint?: string;
  /** Granular fields flagged advanced are hidden behind the preset until the user
   *  picks "Custom" or taps "Customize". Non-advanced fields always show. */
  advanced?: boolean;
}

export interface SportPlugin<S = unknown> {
  id: SportId;
  name: string;
  /** emoji placeholder until real icons are added */
  icon: string;
  archetype: ScoringArchetype;
  /** Fresh match state. `config` lets a tournament tweak rules (e.g. sets to win). */
  createInitialState: (config?: Record<string, unknown>) => S;
  /** PURE scoring logic. Never mutate `state`; return a new object. */
  reducer: (state: S, action: ScoreAction) => S;
  /** Projection for the universal scoreboard. */
  summary: (state: S) => ScoreSummary;
  /** Has the match reached its end condition? */
  isComplete: (state: S) => boolean;
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
   * Optional positional layout. `formation()` is a fresh, unfilled one-side
   * template (x/y normalised); `Court` renders the sport's court/field with both
   * teams' lineups. Sports that set these get a visual lineup editor + map.
   */
  formation?: () => LineupSlot[];
  Court?: React.FC<CourtProps>;
}
