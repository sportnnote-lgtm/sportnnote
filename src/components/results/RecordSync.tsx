/**
 * SD-130 on the event page:
 *  • SyncBanner — a locked phase whose stat lines (athletes' profiles) or new
 *    record didn't save: the results themselves are safe; "Retry saving
 *    results to profiles" sends the same (idempotent) writes again.
 *  • ResyncButton — organisers: rebuild a locked final's profile lines from
 *    its saved results (after an app restart lost the retry).
 *  • OfficialsCard — organisers: who runs this event (host_ids on every round).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, Card, FormError, SelectChip, textStyles } from '../ui';
import { askConfirm } from '../ConfirmSheet';
import { EventOfficials } from './EventOfficials';
import { getSyncIssue, onSyncIssues, retrySync, resyncFinalLines, setEventOfficials, type ResultSyncIssue } from '../../data/resultsStore';
import type { FieldEntry, FieldEvent, Tournament } from '../../core/types';
import type { PointsSettings } from '../../data/results';

export function SyncBanner({ phaseId, onDone }: { phaseId: string; onDone?: () => void }) {
  const [issue, setIssue] = useState<ResultSyncIssue | null>(() => getSyncIssue(phaseId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setIssue(getSyncIssue(phaseId)); return onSyncIssues(() => setIssue(getSyncIssue(phaseId))); }, [phaseId]);
  if (!issue) return null;
  const what = [issue.lines ? 'athletes’ profiles (medals, points, PBs)' : '', issue.recordOps ? 'the record book' : ''].filter(Boolean).join(' and ');
  const retry = async () => {
    setBusy(true); setError(null);
    try { await retrySync(phaseId); onDone?.(); } catch (e) { setError((e as Error).message || 'Still not saved — check the connection and try again.'); } finally { setBusy(false); }
  };
  return (
    <View style={st.banner} accessibilityRole="alert">
      <Text style={st.bannerTitle}>⚠ Results saved, but not yet to {what}</Text>
      <Text style={textStyles.muted}>{issue.recordsError ?? issue.linesError ?? 'The connection dropped.'} The results and places are safe on this event.</Text>
      <FormError message={error} />
      <Button label={busy ? 'Saving…' : 'Retry saving results to profiles'} onPress={() => void retry()} disabled={busy} />
    </View>
  );
}

export function ResyncButton({ phase, entries, nameOf, points, onInfo, onError }: {
  phase: FieldEvent; entries: FieldEntry[]; nameOf: (id: string) => string; points?: PointsSettings;
  onInfo: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const ok = await askConfirm({ title: 'Re-sync results to profiles?', message: 'Each athlete’s line for this final (place, mark, medal, points) is written again from the saved results. Nothing else changes — safe to repeat.', yesLabel: 'Yes, re-sync', noLabel: 'No, cancel', tone: 'caution' });
    if (!ok) return;
    setBusy(true);
    try { const n = await resyncFinalLines(phase, entries, nameOf, points); onInfo(`Re-synced ${n} profile line${n === 1 ? '' : 's'}.`); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return <Button label={busy ? 'Re-syncing…' : '↻ Re-sync results to profiles'} variant="ghost" onPress={() => void run()} disabled={busy} />;
}

export function OfficialsCard({ tournament, phase, eventKey, onSaved }: { tournament: Tournament | null | undefined; phase: FieldEvent; eventKey: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>(phase.hostIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setIds(phase.hostIds ?? []); }, [phase.id, (phase.hostIds ?? []).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = (phase.hostIds ?? []).length;
  if (!open) return <SelectChip label={`👥 Event officials${n ? ` (${n})` : ''}`} active={false} onPress={() => setOpen(true)} />;
  const save = async () => {
    setBusy(true); setError(null);
    try { await setEventOfficials(eventKey, ids); setOpen(false); onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <EventOfficials tournament={tournament} value={ids} onChange={setIds} title="👥 Who runs this event" bare />
      <FormError message={error} />
      <View style={st.row}>
        <Button label={busy ? 'Saving…' : 'Save officials'} onPress={() => void save()} disabled={busy} />
        <Button label="Cancel" variant="ghost" onPress={() => { setOpen(false); setIds(phase.hostIds ?? []); setError(null); }} />
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  banner: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.danger + '66', backgroundColor: theme.colors.danger + '14' },
  bannerTitle: { color: theme.colors.text, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
