/** "Open in the SportnNote app" on the WEB join pages (join-club / join-tournament,
 *  SD-108). Someone who scans an invite QR with the phone camera lands here in the
 *  browser:
 *   • Android → "Open in the SportnNote app" (an intent:// link: opens the installed
 *     APK on the same join screen, or the download page when it isn't installed)
 *     + "Continue on the web".
 *   • iPhone → continue here; tip: Share → Add to Home Screen.
 *  Renders nothing in the phone app or on desktop. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from './ui';
import { androidIntentUrl, webDevice } from '../core/inviteText';

export function OpenInAppBanner({ path }: { path: string }) {
  const [hidden, setHidden] = useState(false);
  if (Platform.OS !== 'web' || hidden) return null;
  const nav: any = (globalThis as any).navigator;
  const device = webDevice(nav?.userAgent, nav?.maxTouchPoints ?? 0);
  if (device === 'other') return null;

  if (device === 'ios') {
    return (
      <Card style={st.card}>
        <Text style={textStyles.body}>📱 You’re on the SportnNote web app — carry on right here.</Text>
        <Text style={textStyles.muted}>Tip: tap Share → <Text style={st.b}>Add to Home Screen</Text> to keep SportnNote like an app.</Text>
      </Card>
    );
  }

  const open = () => {
    const loc: any = (globalThis as any).location;
    // Same tab: Chrome hands intent:// to Android (window.open would leave a blank tab).
    if (loc) loc.href = androidIntentUrl(path);
  };
  return (
    <Card style={st.card}>
      <Text style={textStyles.body}>Have the SportnNote app?</Text>
      <View style={st.row}>
        <Button label="📲 Open in the SportnNote app" onPress={open} />
        <Button label="Continue on the web" variant="ghost" onPress={() => setHidden(true)} />
      </View>
      <Text style={textStyles.muted}>No app yet? “Open in the app” takes you to the download page.</Text>
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2) },
  row: { gap: theme.spacing(2) },
  b: { fontWeight: '800', color: theme.colors.text },
});
