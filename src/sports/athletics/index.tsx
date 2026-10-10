/**
 * Athletics plugin (SD-90: track). Athletics isn't a head-to-head match: a
 * meet is a programme of EVENTS (100 m U14 Boys, 4 × 100 m U14 Girls …), each
 * run as heats → (semi-finals →) final on the results engine
 * (data/results/*, screens/AthleticsEventSetupScreen + ResultsEventScreen).
 * The plugin registers the sport (picker, hub, profile, stat schema) and its
 * meet settings; the match-scoring members are inert placeholders so the
 * generic match screens never break if an athletics "match" is opened.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';

export interface AthleticsMatchState { ended: boolean }

const ScoringControls: SportPlugin<AthleticsMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🏃 Athletics runs as events</Text>
    <Text style={textStyles.muted}>Set up each race from the tournament’s Athletics page: add the event, its entrants and rounds, then enter times heat by heat.</Text>
  </View>
);

export const athleticsPlugin: SportPlugin<AthleticsMatchState> = {
  id: 'athletics',
  name: 'Athletics',
  icon: '🏃',
  archetype: 'measured',
  participantKind: 'individual',
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Athletics event', detailLine: 'Results are entered per heat on the event page' }),
  ScoringControls,
  correctable: false,
  formatFields: [
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team; tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
        { value: '7,5,4,3,2,1', label: '7-5-4-3-2-1' },
      ],
    },
    {
      key: 'relayFactor', label: 'Relay points', type: 'choice', default: 1,
      options: [{ value: 1, label: 'Same as individual' }, { value: 2, label: 'Double' }],
    },
    { key: 'handTimed', label: 'Hand-timed meet', type: 'toggle', default: false, onCreate: true, hint: 'stopwatches and no wind gauge: hand times count for PBs and meet records (shown "h")' },
    { key: 'reaction', label: 'Reaction times', type: 'toggle', default: false, advanced: true, hint: 'a start-information system reads reaction times' },
  ],
};
