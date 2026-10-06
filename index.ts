import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// Mobile Safari zooms the page in when a text box under 16px gets focus, which
// pushes buttons beside it off-screen. Keep touch-screen inputs at 16px (pinch
// zoom still works — we don't disable it).
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = '@media (pointer: coarse) { input, textarea, select { font-size: 16px !important; } }';
  document.head.appendChild(style);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
