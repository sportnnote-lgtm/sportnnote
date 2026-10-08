/** Pick an image from the device library (web: file picker). Returns null if the
 *  user cancels or denies permission. Upload it with `uploadImage` (repos) —
 *  the URI it returns only works on this device. */
import * as ImagePicker from 'expo-image-picker';

export type PickedImage = { uri: string; mimeType?: string; fileSize?: number };

export async function pickImage(opts: { aspect?: [number, number] } = {}): Promise<PickedImage | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      ...(opts.aspect ? { aspect: opts.aspect } : {}),
      quality: 0.6,
    });
    if (result.canceled) return null;
    const a = result.assets[0];
    return a ? { uri: a.uri, mimeType: a.mimeType ?? undefined, fileSize: a.fileSize ?? undefined } : null;
  } catch {
    return null;
  }
}

/** The bare URI (the verification-document fallback still uses this). */
export async function pickPhoto(): Promise<string | null> {
  return (await pickImage())?.uri ?? null;
}
