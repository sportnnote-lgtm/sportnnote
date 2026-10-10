/**
 * Weightlifting plugin (SD-97, IWF Technical & Competition Rules). Like
 * athletics and swimming, a meet is a programme of EVENTS — one per bodyweight
 * category (Men 79 kg, Youth Girls 53 kg …) — each a single session on the
 * results engine (data/results/weightlifting.ts): weigh-in, the snatch then
 * the clean & jerk with three attempts each, the IWF calling order, good lift /
 * no lift, the total. The plugin registers the sport and its meet settings;
 * the match-scoring members are inert placeholders so the generic match
 * screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';

export interface WeightliftingMatchState { ended: boolean }

const ScoringControls: SportPlugin<WeightliftingMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🏋️ Weightlifting runs as events</Text>
    <Text style={textStyles.muted}>Set up each bodyweight category from the tournament’s Weightlifting page: add the lifters, weigh them in, then enter each attempt as it is lifted.</Text>
  </View>
);

export const weightliftingPlugin: SportPlugin<WeightliftingMatchState> = {
  id: 'weightlifting',
  name: 'Weightlifting',
  icon: '🏋️',
  archetype: 'measured',
  participantKind: 'individual',
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Weightlifting event', detailLine: 'Attempts are entered on the event page' }),
  ScoringControls,
  correctable: false,
  formatFields: [
    {
      key: 'liftMedals', label: 'Medals for snatch and C&J too', type: 'toggle', default: false, onCreate: true,
      hint: 'on: medals (and points) for the snatch, the clean & jerk and the total, as at IWF World Championships; off: the total only, as at the Olympic Games',
    },
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team; tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
        { value: '28,25,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1', label: 'IWF team points 28-25-23-22-…-1' },
      ],
    },
    { key: 'sinclair', label: 'Sinclair totals', type: 'toggle', default: false, advanced: true, hint: 'compare lifters across bodyweight categories (IWF Sinclair coefficients 2021–2024)' },
  ],
};
