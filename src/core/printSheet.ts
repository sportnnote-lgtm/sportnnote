/** SD-129 — print a sheet (WEB build; the phone app uses printSheet.native.ts).
 *  Opens the A4 sheet in a new tab with a "Print / Save as PDF" bar and (when
 *  asked) the browser's print dialog. A blocked pop-up falls back to printing
 *  from a hidden frame on this page. */
export type PrintOutcome = 'opened' | 'printed' | 'shared' | 'failed';

export async function printSheet(html: string, opts: { autoPrint?: boolean; fallbackText?: string } = {}): Promise<PrintOutcome> {
  if (typeof window === 'undefined') return 'failed';
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    if (opts.autoPrint) setTimeout(() => { try { w.focus(); w.print(); } catch { /* the user can press the bar's button */ } }, 400);
    return 'opened';
  }
  try {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    const d = f.contentWindow?.document;
    if (!d) return 'failed';
    d.open(); d.write(html); d.close();
    setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60000); }, 400);
    return 'printed';
  } catch { return 'failed'; }
}

/** Whether a real print / PDF is available here (always on the web). */
export const canPrint = (): boolean => true;
