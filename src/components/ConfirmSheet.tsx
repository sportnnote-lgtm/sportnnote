/** SD-106 — the "Are you sure?" sheet for match-ending / match-clearing actions.
 *  A modal sheet (not window.confirm, which some web contexts auto-dismiss) with
 *  a clear title, one line of consequence and two big buttons: the safe NO
 *  (green outline, first / on top, focused by default) and the destructive YES
 *  (solid red, or amber for period-level actions).
 *
 *  Use it imperatively from anywhere: `if (!(await askConfirm(copy))) return;`.
 *  `<ConfirmSheetHost />` is mounted once in App.tsx; without a host (tests,
 *  a screen rendered outside the app) it falls back to confirmAction. */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { theme } from '../core/theme';
import { confirmAction } from '../core/confirm';
import { confirmCopy, type ConfirmContext, type ConfirmCopy, type MatchAction } from '../core/matchSafety';

type Ask = { copy: ConfirmCopy; resolve: (ok: boolean) => void };
let show: ((a: Ask) => void) | null = null;

/** Ask with the sheet; resolves true only on YES. */
export function askConfirm(copy: ConfirmCopy): Promise<boolean> {
  if (!show) return confirmAction(copy.title, copy.message, copy.yesLabel, copy.tone === 'danger');
  return new Promise((resolve) => show!({ copy, resolve }));
}

/** Ask with the standard copy for a match action (src/core/matchSafety.ts). */
export const confirmMatchAction = (action: MatchAction, ctx?: ConfirmContext): Promise<boolean> => askConfirm(confirmCopy(action, ctx));

export function ConfirmSheetHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const noRef = useRef<View>(null);
  useEffect(() => {
    show = (a) => setAsk((prev) => { prev?.resolve(false); return a; });
    return () => { show = null; };
  }, []);
  // NO is the default: focus it on web so Enter / Space keeps scoring.
  useEffect(() => {
    if (!ask || Platform.OS !== 'web') return;
    const t = setTimeout(() => (noRef.current as unknown as { focus?: () => void } | null)?.focus?.(), 50);
    return () => clearTimeout(t);
  }, [ask]);
  // keep the last copy on screen while the sheet slides away (no blank sheet)
  const last = useRef<ConfirmCopy | null>(null);
  if (ask) last.current = ask.copy;
  const done = (ok: boolean) => { ask?.resolve(ok); setAsk(null); };
  const c = ask?.copy ?? last.current;
  const yesBg = c?.tone === 'caution' ? theme.colors.accent : theme.colors.danger;
  return (
    <Modal visible={!!ask} transparent animationType="slide" onRequestClose={() => done(false)}>
      <Pressable style={st.backdrop} onPress={() => done(false)} accessibilityLabel={c ? `${c.noLabel} — close` : 'Close'}>
        <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal accessibilityRole="alert">
          <View style={st.grab} />
          <Text style={st.title} accessibilityRole="header">{c?.title}</Text>
          <Text style={st.message}>{c?.message}</Text>
          <View style={st.buttons}>
            <TouchableOpacity ref={noRef} style={[st.btn, st.no]} activeOpacity={0.85} accessibilityRole="button"
              accessibilityLabel={c?.noLabel} accessibilityHint="Closes this and changes nothing" onPress={() => done(false)}>
              <Text style={[st.btnText, { color: theme.colors.primary }]}>{c?.noLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.btn, { backgroundColor: yesBg, borderColor: yesBg }]} activeOpacity={0.85} accessibilityRole="button"
              accessibilityLabel={c?.yesLabel} accessibilityHint={c?.message} onPress={() => done(true)}>
              <Text style={[st.btnText, { color: '#06120D' }]}>{c?.yesLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(5), paddingBottom: theme.spacing(8),
    width: '100%', maxWidth: 560, alignSelf: 'center', gap: theme.spacing(3),
  },
  grab: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: theme.colors.border },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800' },
  message: { color: theme.colors.textMuted, fontSize: theme.font.body, lineHeight: 21 },
  buttons: { gap: theme.spacing(3), marginTop: theme.spacing(2) },
  btn: { minHeight: 56, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing(4), borderWidth: 2 },
  no: { backgroundColor: theme.colors.primary + '1F', borderColor: theme.colors.primary },
  btnText: { fontSize: theme.font.h3, fontWeight: '900' },
});
