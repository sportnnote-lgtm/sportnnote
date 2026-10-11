/**
 * Canoe sprint plugin (SD-100, ICF Canoe Sprint Competition Rules). Like athletics and swimming, a regatta is a
 * programme of EVENTS (K1 500 m Women, C2 1000 m Men …), each raced in lanes as a straight final or
 * through a progression (heats → semi-finals → Finals A / B) on the results engine
 * (data/results/crews.ts, the shared event setup, results and hub screens).
 * The plugin registers the sport and its regatta settings; the match-scoring
 * members are inert placeholders so the generic match screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';

export interface CanoeMatchState { ended: boolean }

const ScoringControls: SportPlugin<CanoeMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🛶 Canoe sprint runs as events</Text>
    <Text style={textStyles.muted}>Set up each race from the tournament’s Canoe sprint page: add the boat (K1 … C4) and distance, the boats and their paddlers and the progression, then enter the finish times race by race.</Text>
  </View>
);

export const canoePlugin: SportPlugin<CanoeMatchState> = {
  id: 'canoe',
  name: 'Canoe sprint',
  icon: '🛶',
  archetype: 'measured',
  participantKind: 'individual',
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Canoe sprint event', detailLine: 'Times are entered per race on the event page' }),
  ScoringControls,
  correctable: false,
  formatFields: [
    {
      key: 'lanes', label: 'Lanes', type: 'choice', default: 9, onCreate: true,
      hint: 'ICF sprint courses have 9 lanes',
      options: [{ value: 9, label: '9' }, { value: 8, label: '8' }, { value: 6, label: '6' }, { value: 5, label: '5' }, { value: 4, label: '4' }],
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
    { key: 'splits', label: 'Intermediate times', type: 'toggle', default: false, advanced: true, hint: 'record each boat’s time every 250 m (every 100 m over 200 m, every 1000 m over 5000 m)' },
  ],
};
