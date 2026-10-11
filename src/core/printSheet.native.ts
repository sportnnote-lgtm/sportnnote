/** SD-129 — print a sheet (PHONE APP build; the web build uses printSheet.ts).
 *  expo-print is a native module: an APK built before it was added doesn't
 *  have it, so we look for the native side first and, without it, share the
 *  sheet as text instead (WhatsApp, as before). With it, the system print
 *  dialog opens — "Save as PDF" is one of its printers. */
import { requireOptionalNativeModule } from 'expo';
import { shareMessage } from './share';

export type PrintOutcome = 'opened' | 'printed' | 'shared' | 'failed';

type PrintApi = typeof import('expo-print');
let mod: PrintApi | null | undefined;
function expoPrint(): PrintApi | null {
  if (mod !== undefined) return mod;
  mod = null;
  try {
    if (requireOptionalNativeModule('ExpoPrint')) mod = require('expo-print') as PrintApi;
  } catch { mod = null; }
  return mod;
}

export const canPrint = (): boolean => !!expoPrint();

export async function printSheet(html: string, opts: { autoPrint?: boolean; fallbackText?: string } = {}): Promise<PrintOutcome> {
  const p = expoPrint();
  if (p) {
    try {
      // A4 at 72 PPI (595 × 842 pt); the sheet's own CSS sets the margins.
      await p.printAsync({ html: html.replace(/<div class="bar">[\s\S]*?<\/div>/, ''), width: 595, height: 842 });
      return 'printed';
    } catch (e) {
      // closing the dialog isn't a failure
      if (/cancel/i.test(String((e as Error)?.message))) return 'printed';
    }
  }
  if (opts.fallbackText) { await shareMessage(opts.fallbackText, 'results'); return 'shared'; }
  return 'failed';
}
