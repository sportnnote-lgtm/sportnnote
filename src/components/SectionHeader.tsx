/** A section title with an optional inline "See all" affordance on the same row.
 *  App-wide convention: a section shows at most SECTION_CAP records; when more
 *  exist, "See all (N) ›" opens the full list. Keeps every list section
 *  consistent — a glanceable top-5 with a one-tap path to everything. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { textStyles } from './ui';

/** Max records any section renders inline before "See all" takes over. */
export const SECTION_CAP = 5;

export function SectionHeader({
  title,
  onSeeAll,
  count,
  expanded,
}: {
  title: string;
  /** when provided, renders the affordance on the right; omit to hide it */
  onSeeAll?: () => void;
  /** total number of records (shown in the affordance, e.g. "See all (12)") */
  count?: number;
  /** for inline-expand sections: true once expanded, so the label flips to "Show less" */
  expanded?: boolean;
}) {
  return (
    <View style={st.row}>
      <Text style={[textStyles.h3, st.title]} numberOfLines={1}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={st.seeAll}>{expanded ? 'Show less' : `See all${count != null ? ` (${count})` : ''} ›`}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2), marginTop: theme.spacing(3) },
  title: { flexShrink: 1 },
  seeAll: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
