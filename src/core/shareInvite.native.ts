/** Share an invite: the QR code IMAGE together with the message (SD-108).
 *  PHONE APP build (the web build uses shareInvite.ts).
 *
 *  The on-screen QR (react-native-qrcode-svg) is rendered to a PNG with
 *  react-native-svg's toDataURL and shared with react-native-share, which puts the
 *  image AND the text in one Android share intent (WhatsApp: image + caption).
 *  react-native-share is a native module: an APK built before it was added doesn't
 *  have it, so we look it up first and fall back to sharing the text only. */
import { Share, TurboModuleRegistry } from 'react-native';
import { track } from './telemetry';
import type { InviteShareInput, InviteShareResult } from './shareInvite';

export type { InviteShareInput, InviteShareResult } from './shareInvite';

type RNShareApi = { open: (o: Record<string, unknown>) => Promise<{ success?: boolean; dismissedAction?: boolean }> };

let rnShare: RNShareApi | null | undefined;
function nativeShare(): RNShareApi | null {
  if (rnShare !== undefined) return rnShare;
  rnShare = null;
  try {
    if (TurboModuleRegistry.get('RNShare')) rnShare = require('react-native-share').default as RNShareApi;
  } catch { rnShare = null; }
  return rnShare;
}

/** Base64 PNG of the rendered QR (null if it isn't on screen / times out). */
function qrBase64(svgRef: unknown): Promise<string | null> {
  const toDataURL = (svgRef as { toDataURL?: (cb: (b64: string) => void, o?: object) => void } | null | undefined)?.toDataURL?.bind(svgRef);
  if (!toDataURL) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 2000);
    try { toDataURL((b64: string) => { clearTimeout(t); resolve(b64 || null); }, { width: 600, height: 600 }); }
    catch { clearTimeout(t); resolve(null); }
  });
}

/** Native has no canvas — the web-only PNG builder. */
export const qrPngDataUrl = (): string | null => null;

export async function shareInviteWithQr(input: InviteShareInput): Promise<InviteShareResult> {
  const api = nativeShare();
  if (api) {
    const b64 = await qrBase64(input.svgRef);
    if (b64) {
      try {
        const res = await api.open({
          message: input.message,
          url: `data:image/png;base64,${b64}`,
          type: 'image/png',
          filename: input.fileName.replace(/\.png$/i, ''),
          failOnCancel: false,
        });
        track('share_link', { what: 'invite_qr' });
        return res?.dismissedAction ? 'cancelled' : 'shared-image';
      } catch { /* fall back to text */ }
    }
  }
  try {
    const r = await Share.share({ message: input.message });
    if (r.action === Share.dismissedAction) return 'cancelled';
    track('share_link', { what: 'invite' });
    return 'shared-text';
  } catch {
    return 'failed';
  }
}
