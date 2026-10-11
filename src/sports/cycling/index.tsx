/**
 * Cycling plugin (SD-98, UCI Regulations Part 2 road / Part 3 track). Like
 * athletics and rowing, a race day is a programme of EVENTS (U16 Boys ITT
 * 10 km, Girls road race, Open sprint, points race …) on the results engine
 * (data/results/cycling.ts and the shared event setup, results and hub
 * screens): time trials by the clock, road races by the order on the line with
 * same-time groups, stage races by GC, track sprint match play, keirin,
 * scratch, points and elimination races. The match-scoring members are inert
 * placeholders so the generic match screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';

export interface CyclingMatchState { ended: boolean }

const ScoringControls: SportPlugin<CyclingMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🚴 Cycling runs as events</Text>
    <Text style={textStyles.muted}>Set up each race from the tournament’s Cycling page — a time trial, road race, stage race, pursuit, sprint, keirin, scratch, points or elimination race — then enter times or the order on the line race by race.</Text>
  </View>
);

export const cyclingPlugin: SportPlugin<CyclingMatchState> = {
  id: 'cycling',
  name: 'Cycling',
  icon: '🚴',
  archetype: 'measured',
  participantKind: 'individual',
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Cycling event', detailLine: 'Times and finish orders are entered per race on the event page' }),
  ScoringControls,
  correctable: false,
  formatFields: [
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team (the GC for a stage race); tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
        { value: '7,5,4,3,2,1', label: '7-5-4-3-2-1' },
      ],
    },
    { key: 'handTimed', label: 'Hand timing', type: 'toggle', default: false, onCreate: true, hint: 'stopwatches, no transponders / photo finish: hand times count for the meet’s records' },
  ],
};
