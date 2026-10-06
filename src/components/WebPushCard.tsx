/**
 * "Notifications on this phone" for the web app (core/webPush.ts). Full card on
 * Match reminders; `compact` = a dismissible nudge on Home. Renders nothing on
 * the native app (it has Expo push) or when notifications are already on.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from './ui';
import { disableWebPush, enableWebPush, webPushStatus, type WebPushStatus } from '../core/webPush';

const DISMISS_KEY = 'sn.webpush.nudgeDismissed';

export function WebPushCard({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<WebPushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return compact && typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => { void webPushStatus().then(setStatus); }, []);

  if (!status || status === 'unsupported') return null;
  if (compact && (dismissed || status === 'on' || status === 'denied')) return null;

  const turnOn = async () => {
    setBusy(true); setError(null);
    try { setStatus(await enableWebPush()); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  const turnOff = async () => { setBusy(true); await disableWebPush(); setStatus('off'); setBusy(false); };
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } setDismissed(true); };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <Text style={[textStyles.h3, { flex: 1 }]}>🔔 {status === 'on' ? 'Notifications are on' : 'Get match alerts on this phone'}</Text>
        {compact && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismiss} hitSlop={10}><Text style={st.x}>✕</Text></TouchableOpacity>}
      </View>

      {status === 'needs-install' && (
        <>
          <Text style={textStyles.muted}>On iPhone, alerts work once SportnNote is on your Home Screen:</Text>
          <Text style={textStyles.body}>1. Tap the Share button (□↑) in Safari{'\n'}2. Choose “Add to Home Screen”{'\n'}3. Open SportnNote from the new icon and turn alerts on here</Text>
        </>
      )}
      {status === 'off' && (
        <>
          <Text style={textStyles.muted}>Reminders before your matches, live scores of players you follow, and new messages.</Text>
          <Button label={busy ? 'Turning on…' : 'Turn on notifications'} onPress={() => void turnOn()} disabled={busy} />
        </>
      )}
      {status === 'denied' && (
        <Text style={textStyles.muted}>Notifications are blocked for SportnNote. Allow them in your phone’s Settings → Notifications (or the browser’s site settings), then come back.</Text>
      )}
      {status === 'on' && !compact && (
        <>
          <Text style={textStyles.muted}>This phone gets your match reminders and alerts.</Text>
          <Button label={busy ? 'Turning off…' : 'Turn off on this phone'} variant="ghost" onPress={() => void turnOff()} disabled={busy} />
        </>
      )}
      {error ? <Text style={st.err}>{error}</Text> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  x: { color: theme.colors.textMuted, fontSize: 16, fontWeight: '700' },
  err: { color: theme.colors.danger, fontSize: theme.font.small },
});
