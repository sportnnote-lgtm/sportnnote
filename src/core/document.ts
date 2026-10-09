/**
 * Pick a verification document — an image OR a PDF. On web (and the preview) this
 * uses a native file input that accepts both. On a device it falls back to the
 * photo library (a scan/photo of the document); adding `expo-document-picker`
 * would enable picking a PDF file directly on native too.
 */
import { Platform } from 'react-native';
import { pickPhoto } from './photo';

export interface PickedDoc {
  name: string;
  uri: string;
  /** MIME type when known (web file input); undefined for a native photo pick. */
  mimeType?: string;
}

export async function pickDocument(): Promise<PickedDoc | null> {
  if (Platform.OS === 'web') {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return null;
    return new Promise<PickedDoc | null>((resolve) => {
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.style.display = 'none';
      input.onchange = () => {
        const file = input.files && input.files[0];
        resolve(file ? { name: file.name, uri: URL.createObjectURL(file), mimeType: file.type || undefined } : null);
        input.remove();
      };
      // if the dialog is dismissed without a file, clean up after a while
      doc.body.appendChild(input);
      input.click();
      setTimeout(() => input.isConnected && input.remove(), 120000);
    });
  }
  // Native fallback: a photo/scan of the document.
  const uri = await pickPhoto();
  return uri ? { name: uri.split('/').pop() ?? 'document', uri } : null;
}

export interface PickedText {
  name: string;
  text: string;
}

/** Pick a text file (CSV / TSV) and read it — web only (a file input +
 *  `file.text()`). Native returns null: there the organiser pastes the cells
 *  instead. Resolves null when nothing is chosen. A binary spreadsheet (.xlsx)
 *  still resolves with its name so the caller can explain what to do. */
export async function pickTextFile(accept = '.csv,.tsv,.txt,text/csv'): Promise<PickedText | null> {
  if (Platform.OS !== 'web') return null;
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) return null;
  return new Promise<PickedText | null>((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) { resolve(null); return; }
      // Don't decode a binary workbook as text — the name is enough to explain.
      if (/\.(xlsx?|xlsm|ods|numbers)$/i.test(file.name)) { resolve({ name: file.name, text: '' }); return; }
      try { resolve({ name: file.name, text: await file.text() }); } catch { resolve(null); }
    };
    doc.body.appendChild(input);
    input.click();
    setTimeout(() => input.isConnected && input.remove(), 120000);
  });
}
