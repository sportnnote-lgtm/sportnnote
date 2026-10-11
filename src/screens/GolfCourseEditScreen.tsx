/** SD-122 — edit a golf course (its creator): name, pars, stroke indexes and
 *  tees. Open rounds on the course pick up the change at once; finished
 *  rounds keep what was recorded unless the organiser taps "Recompute
 *  finished rounds" (asked first). */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, Card, ScreenTitle, FormError, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import { GolfCourseEditor, type CourseDraft } from '../components/golf/GolfCourseEditor';
import { useAuth } from '../core/auth';
import { isSupabaseConfigured } from '../core/supabase';
import { getGolfCourse, updateGolfCourse, roundsOnCourse, recomputeFinishedRounds, canEditCourse } from '../data/golf';
import type { FieldEvent, GolfCourse } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

export default function GolfCourseEditScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'GolfCourseEdit'>>();
  const { profile } = useAuth();
  const [course, setCourse] = useState<GolfCourse | null | undefined>(undefined);
  const [rounds, setRounds] = useState<FieldEvent[]>([]);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, rs] = await Promise.all([getGolfCourse(params.courseId), roundsOnCourse(params.courseId).catch(() => [] as FieldEvent[])]);
    setCourse(c);
    setRounds(rs);
  }, [params.courseId]);
  useEffect(() => { void load(); }, [load]);

  if (course === undefined) return <SafeAreaView style={st.safe}><Text style={[textStyles.muted, st.pad]}>Loading course…</Text></SafeAreaView>;
  if (!course) return <SafeAreaView style={st.safe}><Text style={[textStyles.muted, st.pad]}>Course not found.</Text></SafeAreaView>;
  const mayEdit = canEditCourse(course, profile?.id, !isSupabaseConfigured);
  const open = rounds.filter((r) => r.status !== 'completed' && r.status !== 'cancelled').length;
  const finished = rounds.filter((r) => r.status === 'completed').length;

  const save = async (d: CourseDraft) => {
    const c = await updateGolfCourse(course.id, d);
    setCourse(c);
    setSaved(true);
    setNote(null);
    await load();
  };

  const recompute = async () => {
    if (!(await askConfirm({
      title: `Recompute ${finished} finished round${finished === 1 ? '' : 's'}?`,
      message: `Scores to par, net, Stableford points and handicap differentials of the finished rounds on ${course.name} are worked out again with the course as it is now. The strokes on each card don't change.`,
      yesLabel: 'Yes, recompute', noLabel: 'No, keep as recorded', tone: 'caution',
    }))) return;
    setBusy(true); setError(null);
    try {
      const r = await recomputeFinishedRounds(course.id);
      setNote(`${r.done} finished round${r.done === 1 ? '' : 's'} recomputed.${r.skipped ? ` ${r.skipped} skipped — only a round's organiser can recompute it.` : ''}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not recompute'); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="⛳ Edit course" subtitle={course.name} />
        {!mayEdit ? (
          <Card><Text style={textStyles.body}>Only the person who added this course can edit it. Ask them, or add your own copy from “＋ New course”.</Text></Card>
        ) : (
          <>
            {saved && (
              <Card style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>✓ Course saved</Text>
                <Text style={textStyles.muted}>
                  {open ? `${open} open round${open === 1 ? '' : 's'} on this course now score${open === 1 ? 's' : ''} with the new pars, stroke indexes and tees.` : 'No open rounds on this course.'}
                  {finished ? ` ${finished} finished round${finished === 1 ? '' : 's'} keep${finished === 1 ? 's' : ''} the scores as recorded.` : ''}
                </Text>
                <Button label="Done" onPress={() => nav.goBack()} />
              </Card>
            )}
            {!saved && (open > 0 || finished > 0) && (
              <Text style={textStyles.muted}>
                Used by {open} open and {finished} finished round{open + finished === 1 ? '' : 's'}. Open rounds update when you save; finished ones stay as recorded.
              </Text>
            )}
            {finished > 0 && (
              <Card style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.muted}>Fixed a mistake that was there when those rounds were played? Work their scores out again with the course as it is now.</Text>
                <Button label={busy ? 'Recomputing…' : `Recompute finished rounds (${finished})`} variant="ghost" onPress={() => void recompute()} disabled={busy} />
                {note && <Text style={textStyles.muted}>{note}</Text>}
                <FormError message={error} />
              </Card>
            )}
            <GolfCourseEditor key={saved ? 'after' : 'before'} initial={course} onSave={save} onCancel={() => nav.goBack()} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  pad: { padding: theme.spacing(4) },
});
