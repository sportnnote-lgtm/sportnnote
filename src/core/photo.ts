/** Pick a photo from the device library. Returns the image URI, or null if the
 *  user cancels or denies permission. Works on web (file picker) and native. */
import * as ImagePicker from 'expo-image-picker';

export async function pickPhoto(): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return null;
    return result.assets[0]?.uri ?? null;
  } catch {
    return null;
  }
}
