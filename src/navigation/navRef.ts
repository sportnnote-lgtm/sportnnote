import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/** The app's navigation container ref — for navigating from outside screens
 *  (onboarding, guest sign-in prompts, notification taps). */
export const navRef = createNavigationContainerRef<RootStackParamList>();
