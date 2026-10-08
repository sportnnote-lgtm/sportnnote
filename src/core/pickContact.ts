/**
 * Pick a person from the phone's own contacts (name + mobile number).
 *  • Android app: the native contact picker (expo-contacts). Only in APKs built
 *    with expo-contacts — older installs don't show the button.
 *  • Web on Android Chrome: the browser's Contact Picker.
 *  • iPhone web: Safari has no contact access — the UI offers "Paste" instead.
 * Nothing is uploaded: only the one contact the user picks is used.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type PickedContact = { name?: string; phones: string[] };

type WebContacts = { select: (props: string[], opts?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };
const webContacts = (): WebContacts | null => {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return null;
  const c = (navigator as unknown as { contacts?: WebContacts }).contacts;
  return c && typeof c.select === 'function' ? c : null;
};

export function canPickContact(): boolean {
  if (Platform.OS === 'web') return !!webContacts();
  return !!requireOptionalNativeModule('ExpoContactsNext');
}

/** null = cancelled. Throws only on real failures. */
export async function pickContact(): Promise<PickedContact | null> {
  const web = webContacts();
  if (web) {
    const [c] = await web.select(['name', 'tel'], { multiple: false });
    if (!c) return null;
    return { name: c.name?.[0]?.trim() || undefined, phones: (c.tel ?? []).filter(Boolean) };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Contact } = require('expo-contacts') as typeof import('expo-contacts');
  const contact = await Contact.presentPicker();
  if (!contact) return null;
  const [name, phones] = await Promise.all([contact.getFullName().catch(() => ''), contact.getPhones().catch(() => [])]);
  return { name: name?.trim() || undefined, phones: phones.map((p) => p.number ?? '').filter(Boolean) };
}

/** iPhone web fallback: read a copied number. */
export const canPaste = (): boolean =>
  Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
export async function pasteText(): Promise<string> {
  return (await navigator.clipboard.readText()).trim();
}
