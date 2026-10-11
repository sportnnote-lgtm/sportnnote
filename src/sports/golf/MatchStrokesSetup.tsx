/** SD-87 — set up a match-play match's handicap strokes: the course (for par
 *  and stroke index), the tee and both players' Handicap Index (pre-filled
 *  from their golf profile, SD-84). WHS Appendix C: singles match play uses
 *  100% of each Course Handicap and the higher player receives the
 *  difference, by stroke index. Leave both blank to enter gross strokes only. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, TextField, textStyles } from '../../components/ui';
import { getGolfCourses, parseIndex, showIndex } from '../../data/golf';
import type { GolfCourse } from '../../core/types';
import { holesFor, standardPar72, type Hole } from './engine';
import { setupMatchStrokes, strokesLine, type MatchStrokes } from './matchStrokes';

const STANDARD = '__standard__';

export function MatchStrokesSetup({
  regulation, firstHole, homeName, awayName, homeIndex, awayIndex, hasStrokes, onSave, onCancel,
}: {
  regulation: number;
  firstHole?: number;
  homeName: string;
  awayName: string;
  homeIndex?: number;
  awayIndex?: number;
  hasStrokes: boolean;
  onSave: (strokes: MatchStrokes | null) => void;
  onCancel: () => void;
}) {
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [courseId, setCourseId] = useState<string>(STANDARD);
  const [tee, setTee] = useState<string | undefined>(undefined);
  const [home, setHome] = useState(showIndex(homeIndex));
  const [away, setAway] = useState(showIndex(awayIndex));
  useEffect(() => { getGolfCourses().then((cs) => { setCourses(cs); if (cs.length) setCourseId(cs[0].id); }).catch(() => {}); }, []);

  const course = courses.find((c) => c.id === courseId);
  const set = regulation === 18 ? '18' : firstHole === 10 ? 'back9' : 'front9';
  const holes: Hole[] = useMemo(() => holesFor({ holes: course?.holes ?? standardPar72() }, set), [course, set]);
  const teeObj = course?.tees.find((t) => t.name === tee) ?? course?.tees[0];
  const hi = parseIndex(home), ai = parseIndex(away);
  const bad = (home.trim() && hi == null) || (away.trim() && ai == null);
  const preview = bad ? null : setupMatchStrokes({ holes, tee: teeObj, homeIndex: hi, awayIndex: ai, course: course?.name ?? 'Standard par 72' });

  return (
    <View style={st.box}>
      <Text style={st.title}>⛳ Strokes and handicap shots</Text>
      <Text style={textStyles.muted}>The course gives par and stroke index; with both Handicap Indexes the higher handicap gets the difference (100%, WHS singles match play) as dots on the hardest holes.</Text>
      <View style={st.chips}>
        {courses.map((c) => <SelectChip key={c.id} label={c.name} active={courseId === c.id} onPress={() => { setCourseId(c.id); setTee(undefined); }} />)}
        <SelectChip label="Standard par 72" active={courseId === STANDARD} onPress={() => setCourseId(STANDARD)} />
      </View>
      {course && course.tees.length > 1 && (
        <View style={st.chips}>
          {course.tees.map((t) => <SelectChip key={t.name} label={`${t.name} tees`} active={(tee ?? course.tees[0].name) === t.name} onPress={() => setTee(t.name)} />)}
        </View>
      )}
      <View style={st.row}>
        <View style={st.flex}><TextField label={`${homeName} · HI`} value={home} onChange={setHome} placeholder="e.g. 12.4" autoCapitalize="none" /></View>
        <View style={st.flex}><TextField label={`${awayName} · HI`} value={away} onChange={setAway} placeholder="e.g. +1.2" autoCapitalize="none" /></View>
      </View>
      {bad ? <Text style={st.warn}>Enter a Handicap Index like 12.4 (or +1.2 for a plus handicap), or leave it blank.</Text>
        : preview ? <Text style={st.preview}>{strokesLine(preview, homeName, awayName)}</Text> : null}
      <Button label="Save" disabled={!!bad} onPress={() => preview && onSave(preview)} />
      {hasStrokes && <Button label="Stop entering strokes" variant="ghost" onPress={() => onSave(null)} />}
      <Button label="Cancel" variant="ghost" onPress={onCancel} />
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  warn: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  preview: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
});
