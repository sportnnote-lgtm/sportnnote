/**
 * Pickleball plugin — archetype: set-game-point. Built on the shared rally engine
 * so every rule is optional with a recreational-friendly default:
 *   • Scoring     — Rally (every rally is a point, default) or Side-out / traditional
 *                   (only the serving side scores; doubles tracks server 1 & 2).
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
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'rec',
      options: [
        { value: 'rec', label: 'Rec (rally · 11)', set: { scoring: 'rally', pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
        { value: 'rec1', label: 'Rec quick (11 · win by 1)', set: { scoring: 'rally', pointsPerGame: 11, winBy: 1, gamesToWin: 2 } },
        { value: 'tournament', label: 'Tournament (best of 5)', set: { scoring: 'rally', pointsPerGame: 11, winBy: 2, gamesToWin: 3 } },
        { value: 'traditional', label: 'Traditional (side-out)', set: { scoring: 'sideout', pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
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
      key: 'scoring', label: 'Scoring', type: 'choice', default: 'rally', advanced: true,
      hint: 'how points are won',
      options: [
        { value: 'rally', label: 'Rally (recreational)' },
        { value: 'sideout', label: 'Side-out (traditional)' },
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
