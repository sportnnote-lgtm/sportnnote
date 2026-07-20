/**
 * Squash plugin — archetype: set-game-point. Built on the shared rally engine,
 * supporting both scoring systems (defaults = modern PAR rules):
 *   • Scoring     — PAR / point-a-rally (every rally scores, default) or
 *                   English / hand-out (only the server scores; doubles tracks
 *                   server 1 & 2 with the hand-out sequence).
 *   • Points      — 11 (PAR default), 15, or 9 (classic English).
 *   • Win by      — 2 (default) or 1 (hard cap).
 *   • Match length— best of 5 (default) / best of 3 / single game.
 *   • Format      — singles (default) or doubles.
 *
 * Singles shares one enclosed court, so there's no symmetric court layout (like
 * cricket, it ships no positional formation).
 */
import { makeRallyPlugin, type RallyState } from '../rallyCore';

export type SquashState = RallyState;

export const squashPlugin = makeRallyPlugin({
  id: 'squash',
  name: 'Squash',
  icon: '⚫',
  sideOutValue: 'english',
  sideOutLabel: 'Hand-out',
  serveSystemLabel: 'English scoring',
  serveTag: 'English',
  defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 },
  hasCourt: false,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'psa',
      options: [
        { value: 'psa', label: 'PSA (PAR 11 · best of 5)', set: { scoring: 'par', pointsPerGame: 11, winBy: 2, gamesToWin: 3 } },
        { value: 'american', label: 'American (PARS 15)', set: { scoring: 'par', pointsPerGame: 15, winBy: 2, gamesToWin: 3 } },
        { value: 'english', label: 'Club English (to 9)', set: { scoring: 'english', pointsPerGame: 9, winBy: 2, gamesToWin: 3 } },
        { value: 'short', label: 'Short (PAR 11 · best of 3)', set: { scoring: 'par', pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 1,
      options: [
        { value: 1, label: 'Singles' },
        { value: 2, label: 'Doubles' },
      ],
    },
    {
      key: 'scoring', label: 'Scoring', type: 'choice', default: 'par', advanced: true,
      hint: 'how points are won',
      options: [
        { value: 'par', label: 'PAR (point-a-rally)' },
        { value: 'english', label: 'English (hand-out)' },
      ],
    },
    {
      key: 'pointsPerGame', label: 'Points to win', type: 'choice', default: 11, advanced: true,
      hint: 'PAR is to 11; English is traditionally to 9',
      options: [
        { value: 11, label: '11' },
        { value: 15, label: '15' },
        { value: 9, label: '9' },
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
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 3, advanced: true,
      options: [
        { value: 3, label: 'Best of 5' },
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single game' },
      ],
    },
  ],
});
