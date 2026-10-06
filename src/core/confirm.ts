/** Cross-platform confirm. React Native Web's Alert.alert ignores buttons (it's a
 *  no-op), so any "Are you sure?" built on it silently does nothing in the web
 *  build — use this instead: window.confirm on web, a native Alert elsewhere. */
import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string, okLabel = 'OK', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** Cross-platform notice (title + message, one OK button). */
export function notice(title: string, message: string): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
