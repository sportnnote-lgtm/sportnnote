/**
 * Pickleball plugin — archetype: set-game-point. Built on the shared rally engine
 * so every rule is optional with a recreational-friendly default:
 *   • Scoring     — Rally (every rally is a point, rec default) or Side-out
 *                   (only the serving side scores; doubles tracks server 1 & 2).
 *                   Sanctioned play (USA Pickleball / PPA / APP) is side-out, so the
 *                   "Tournament" presets are side-out and tournaments default to it
 *                   (SD-06, founder D4). Matches keep the format they were stored with.
 *   • Server      — named by court position (USA Pickleball): one pre-serve "who
 *                   starts on the right" pick per team, then score parity.
 *   • Points      — 11 (default), 15 or 21 to win a game.
 *   • Win by      — 2 (default) or 1 (casual hard cap).
 *   • Match length— best of 1 / 3 / 5 games.
 *   • Format      — singles or doubles (default).
 */
import { makeRallyPlugin, type RallyState } from '../rallyCore';

export type PickleballState = RallyState;

export const pickleballPlugin = makeRallyPlugin({
  id: 'pickleball',
  name: 'Pickleball',
  icon: '🥒',
  sideOutValue: 'sideout',
  sideOutLabel: 'Side-out',
  serveSystemLabel: 'Side-out scoring',
  serveTag: 'side-out',
  defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 },
  hasCourt: true,
  courtPositions: true,
  // SD-115 — "Who serves first?" on the scoring screen too (no default).
  firstServePicker: true,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'rec', tournamentDefault: 'traditional',
      // SD-06 / D4: the old rally "Tournament (best of 5)" preset (value
      // 'tournament') is gone — a stored format keeps its own scoring keys, so
      // matches made with it still play rally. 'traditional' keeps its value
      // (it was already side-out best of 3 to 11) and is now the Tournament preset.
      options: [
        { value: 'traditional', label: 'Tournament (side-out · best of 3 to 11)', set: { scoring: 'sideout', pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
        { value: 'sideout15', label: 'Tournament (side-out · 1 game to 15)', set: { scoring: 'sideout', pointsPerGame: 15, winBy: 2, gamesToWin: 1 } },
        { value: 'sideout21', label: 'Tournament (side-out · 1 game to 21)', set: { scoring: 'sideout', pointsPerGame: 21, winBy: 2, gamesToWin: 1 } },
        { value: 'medal', label: 'Medal match (side-out · best of 5 to 11)', set: { scoring: 'sideout', pointsPerGame: 11, winBy: 2, gamesToWin: 3 } },
        // MLP: rally-scored games to 21 (also the DreamBreaker). The MLP "freeze"
        // at 20 and the DreamBreaker singles rotation aren't tracked yet.
        { value: 'dreambreaker', label: 'MLP (rally · 1 game to 21)', set: { scoring: 'rally', pointsPerGame: 21, winBy: 2, gamesToWin: 1 } },
        { value: 'rec', label: 'Rec (rally · 11)', set: { scoring: 'rally', pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
        { value: 'rec1', label: 'Rec quick (rally · 11 · win by 1)', set: { scoring: 'rally', pointsPerGame: 11, winBy: 1, gamesToWin: 2 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 2,
      options: [
        { value: 2, label: 'Doubles' },
        { value: 1, label: 'Singles' },
      ],
    },
    {
      key: 'scoring', label: 'Scoring', type: 'choice', default: 'rally',
      hint: 'how points are won',
      options: [
        { value: 'sideout', label: 'Side-out (tournament)' },
        { value: 'rally', label: 'Rally (rec / MLP)' },
      ],
    },
    {
      key: 'pointsPerGame', label: 'Points to win', type: 'choice', default: 11, advanced: true,
      options: [
        { value: 11, label: '11' },
        { value: 15, label: '15' },
        { value: 21, label: '21' },
      ],
    },
    {
      key: 'winBy', label: 'Win by', type: 'choice', default: 2, advanced: true,
      hint: '2 is standard; 1 is a casual hard cap',
      options: [
        { value: 2, label: 'Win by 2' },
        { value: 1, label: 'Win by 1' },
      ],
    },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 2, advanced: true,
      options: [
        { value: 2, label: 'Best of 3' },
        { value: 3, label: 'Best of 5' },
        { value: 1, label: 'Single game' },
      ],
    },
  ],
});
