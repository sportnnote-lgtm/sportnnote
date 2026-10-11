/**
 * Rowing plugin (SD-99, World Rowing Rules of Racing). Like athletics and swimming, a regatta is a
 * programme of EVENTS (Men’s 1x 2000 m, U16 Girls 4x 1000 m …), each raced in lanes as a straight final or
 * through a progression (heats → repechage → semi-finals → Finals A / B) on the results engine
 * (data/results/crews.ts, the shared event setup, results and hub screens).
 * The plugin registers the sport and its regatta settings; the match-scoring
 * members are inert placeholders so the generic match screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';

export interface RowingMatchState { ended: boolean }

const ScoringControls: SportPlugin<RowingMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🚣 Rowing runs as events</Text>
    <Text style={textStyles.muted}>Set up each race from the tournament’s Rowing page: add the boat class, the crews (seat by seat, with the cox) and the progression, then enter the finish times race by race.</Text>
  </View>
);

export const rowingPlugin: SportPlugin<RowingMatchState> = {
  id: 'rowing',
  name: 'Rowing',
  icon: '🚣',
  archetype: 'measured',
  participantKind: 'individual',
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Rowing event', detailLine: 'Times are entered per race on the event page' }),
  ScoringControls,
  correctable: false,
  formatFields: [
    {
      key: 'lanes', label: 'Lanes', type: 'choice', default: 6, onCreate: true,
      hint: 'World Rowing courses have 6 lanes (some 8); school courses often 4',
      options: [{ value: 6, label: '6' }, { value: 8, label: '8' }, { value: 4, label: '4' }, { value: 5, label: '5' }],
    },
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team (places run on into Final B); tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
        { value: '7,5,4,3,2,1', label: '7-5-4-3-2-1' },
      ],
    },
    {
      key: 'relayFactor', label: 'Crew-boat points', type: 'choice', default: 1,
      options: [{ value: 1, label: 'Same as single boats' }, { value: 2, label: 'Double' }],
    },
    { key: 'handTimed', label: 'Hand timing', type: 'toggle', default: false, onCreate: true, hint: 'stopwatches at the finish, no photo finish: times to 1/100 count for regatta records' },
    { key: 'splits', label: '500 m splits', type: 'toggle', default: false, advanced: true, hint: 'record each crew’s time at every 500 m' },
  ],
};
