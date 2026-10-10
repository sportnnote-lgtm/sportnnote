/**
 * Table tennis plugin — archetype: set-game-point. Built on the shared rally
 * engine with rally scoring (every rally is a point) and the ITTF service order
 * (2 serves each, alternate every point from 10-10 — legacy 21: 5 each until 20-20; opening server alternates by
 * game — see ./serve.ts).
 *   • Games to 11, win by 2 (default) — or the legacy 21-point game.
 *   • Best of 5 (default) / 7 / 3.
 *   • Singles (default) or doubles.
 */
import { makeRallyPlugin, type RallyState } from '../rallyCore';

export type TableTennisState = RallyState;

export const tableTennisPlugin = makeRallyPlugin({
  id: 'tabletennis',
  name: 'Table tennis',
  icon: '🏓',
  // Table tennis has no serve-based scoring system; these labels are unused.
  sideOutValue: '__none__',
  sideOutLabel: 'Service',
  serveSystemLabel: 'Rally scoring',
  serveTag: 'rally',
  defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 },
  hasCourt: false,
  firstServePicker: true,
  serveRule: 'tt',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'bo5',
      options: [
        { value: 'bo5', label: 'Best of 5 (to 11)', set: { pointsPerGame: 11, winBy: 2, gamesToWin: 3 } },
        { value: 'bo7', label: 'Best of 7 (to 11)', set: { pointsPerGame: 11, winBy: 2, gamesToWin: 4 } },
        { value: 'bo3', label: 'Best of 3 (to 11)', set: { pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
        { value: 'legacy21', label: 'Legacy (to 21 · best of 3)', set: { pointsPerGame: 21, winBy: 2, gamesToWin: 2 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    // SD-115: who serves first (ITTF 2.13.1 toss) is asked once, on the scoring
    // screen, with no default; a stored `firstServe` from older formats still seeds it.
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 1,
      options: [
        { value: 1, label: 'Singles' },
        { value: 2, label: 'Doubles' },
      ],
    },
    {
      key: 'pointsPerGame', label: 'Points to win', type: 'choice', default: 11, advanced: true,
      options: [
        { value: 11, label: '11' },
        { value: 21, label: '21' },
      ],
    },
    {
      key: 'winBy', label: 'Win by', type: 'choice', default: 2, advanced: true,
      options: [
        { value: 2, label: 'Win by 2' },
        { value: 1, label: 'Win by 1' },
      ],
    },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 3,
      options: [
        { value: 4, label: 'Best of 7' },
        { value: 3, label: 'Best of 5' },
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single game' },
      ],
    },
  ],
});
