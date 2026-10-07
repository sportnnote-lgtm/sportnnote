/**
 * Last line of defence: if a screen throws while rendering, report it
 * (telemetry) and show a calm "Reload" screen instead of a blank/red one.
 */
import { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { reportError } from '../core/telemetry';
import { isStaleVersionError, reloadForNewVersion } from '../core/staleVersion';

type State = { failed: boolean };

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    // Mixed old/new app files after a publish → just load the newest version.
    if (isStaleVersionError(error) && reloadForNewVersion()) return;
    const e = error instanceof Error ? error : new Error(String(error));
    if (info.componentStack) e.stack = `${e.stack ?? ''}\nComponent stack:${info.componentStack}`;
    reportError(e, { fatal: true });
  }

  private reload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Updates = require('expo-updates') as { reloadAsync?: () => Promise<void> };
      if (Updates.reloadAsync) { void Updates.reloadAsync().catch(() => this.setState({ failed: false })); return; }
    } catch { /* fall through */ }
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={st.wrap}>
        <Text style={st.title}>Something went wrong</Text>
        <Text style={st.body}>We’ve been notified and will look into it. Reload to carry on — anything already saved is safe.</Text>
        <TouchableOpacity accessibilityRole="button" style={st.btn} activeOpacity={0.85} onPress={this.reload}>
          <Text style={st.btnText}>Reload</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(6), gap: theme.spacing(3) },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800', textAlign: 'center' },
  body: { color: theme.colors.textMuted, fontSize: theme.font.body, textAlign: 'center', maxWidth: 360 },
  btn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(8), marginTop: theme.spacing(2) },
  btnText: { color: '#06120D', fontSize: theme.font.body, fontWeight: '800' },
});
