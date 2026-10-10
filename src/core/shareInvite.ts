/** Share an invite: the QR code IMAGE together with the message (SD-108).
 *  WEB build (this file); the phone app uses shareInvite.native.ts.
 *
 *  Web: draws the QR (plus a short caption) to a PNG on a canvas and shares it
 *  with the Web Share API Level 2 — `navigator.share({ files, text })` — where the
 *  browser supports files (Android Chrome, iPhone Safari). Elsewhere it downloads
 *  the PNG and shares / opens WhatsApp with the text, so the image can be attached.
 *  Everything up to the share call is synchronous so the tap still counts as the
 *  user gesture browsers require. */
import { Linking } from 'react-native';
// @ts-expect-error untyped helper of react-native-qrcode-svg (same matrix the on-screen QR draws)
import genMatrix from 'react-native-qrcode-svg/src/genMatrix';
import { track } from './telemetry';

export type InviteShareResult = 'shared-image' | 'shared-text' | 'downloaded' | 'cancelled' | 'needs-tap' | 'failed';

export interface InviteShareInput {
  /** the WhatsApp text, sent as the caption */
  message: string;
  /** what the QR encodes (the https join link) */
  qrValue: string;
  /** "sportnnote-team-l-h-JOIN-ABC.png" */
  fileName: string;
  /** up to two short lines printed under the QR on the image (web) */
  caption?: string[];
  /** the on-screen QR's react-native-svg ref (used by the phone app) */
  svgRef?: unknown;
}

const DARK = '#04150F';

/** The QR as a PNG data URL with a white quiet zone and a caption. Null without a DOM. */
export function qrPngDataUrl(value: string, caption: string[] = []): string | null {
  const g: any = globalThis;
  if (!g.document) return null;
  const matrix: number[][] = genMatrix(value, 'M');
  const n = matrix.length;
  const cell = 10;
  const quiet = 4 * cell;
  const qr = n * cell;
  const lines = caption.filter(Boolean).slice(0, 2);
  const capH = lines.length ? 24 + lines.length * 30 : 0;
  const w = qr + quiet * 2;
  const h = qr + quiet * 2 + capH;
  const canvas = g.document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = DARK;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y][x]) ctx.fillRect(quiet + x * cell, quiet + y * cell, cell, cell);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? '700 22px' : '600 18px'} system-ui, -apple-system, Roboto, sans-serif`;
    let t = line;
    while (t.length > 4 && ctx.measureText(t).width > w - 24) t = `${t.slice(0, -2).trimEnd()}…`.replace(/……$/, '…');
    ctx.fillText(t, w / 2, qr + quiet * 2 - 8 + i * 30 + 15);
  });
  return canvas.toDataURL('image/png');
}

function dataUrlToFile(dataUrl: string, fileName: string): any | null {
  const g: any = globalThis;
  if (!g.File || !g.atob) return null;
  const bin = g.atob(dataUrl.split(',')[1] ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new g.File([bytes], fileName, { type: 'image/png' });
}

function download(dataUrl: string, fileName: string): boolean {
  const g: any = globalThis;
  if (!g.document?.body) return false;
  const a = g.document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  g.document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

const errName = (e: unknown) => (e as { name?: string } | null)?.name;

export async function shareInviteWithQr(input: InviteShareInput): Promise<InviteShareResult> {
  const g: any = globalThis;
  const nav: any = g.navigator;
  let dataUrl: string | null = null;
  try { dataUrl = qrPngDataUrl(input.qrValue, input.caption); } catch { dataUrl = null; }
  const file = dataUrl ? dataUrlToFile(dataUrl, input.fileName) : null;

  // 1) Image + text in one share (WhatsApp shows the text as the image's caption).
  if (file && typeof nav?.share === 'function' && typeof nav?.canShare === 'function') {
    let ok = false;
    try { ok = !!nav.canShare({ files: [file], text: input.message }); } catch { ok = false; }
    if (ok) {
      try {
        await nav.share({ files: [file], text: input.message });
        track('share_link', { what: 'invite_qr' });
        return 'shared-image';
      } catch (e) {
        if (errName(e) === 'AbortError') return 'cancelled';
        // The tap's user-gesture window ran out (a slow network before the share):
        // the caller shows a "Share" button — one more tap works.
        if (errName(e) === 'NotAllowedError') return 'needs-tap';
      }
    }
  }

  // 2) No file sharing here: save the QR image, then send the text.
  const saved = dataUrl ? download(dataUrl, input.fileName) : false;
  try {
    if (typeof nav?.share === 'function') {
      await nav.share({ text: input.message });
    } else {
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(input.message)}`);
    }
    track('share_link', { what: 'invite' });
  } catch (e) {
    if (errName(e) === 'AbortError') return saved ? 'downloaded' : 'cancelled';
    if (errName(e) === 'NotAllowedError' && !saved) return 'needs-tap';
  }
  return saved ? 'downloaded' : 'shared-text';
}
