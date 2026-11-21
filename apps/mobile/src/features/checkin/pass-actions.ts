import type { MemberPass } from '@aiaia/api';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';
import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** The pass QR as an SVG string: black on white, with a quiet zone so it scans when printed. */
export function passQrSvg(qr: string): Promise<string> {
  return QRCode.toString(qr, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Printable page for one pass, from the same SVG the screen shows. */
export function passHtml(pass: MemberPass, svg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>AIAIA delegate pass</title>
<style>body{font-family:sans-serif;text-align:center;padding:24px}
.qr{width:320px;height:320px;margin:16px auto}.qr svg{width:100%;height:100%}</style></head>
<body><h1>${escapeHtml(pass.full_name)}</h1><p>${escapeHtml(pass.branch_name)}</p>
<div class="qr">${svg}</div><p>AIAIA delegate pass</p></body></html>`;
}

export async function printPass(pass: MemberPass, svg: string): Promise<void> {
  await Print.printAsync({ html: passHtml(pass, svg) });
}

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pass';

/**
 * Native: capture the card with view-shot and open the share sheet (save to gallery, send, etc.).
 * Web: download the SVG. Returns false when sharing is not available on this device.
 */
export async function savePassImage(
  pass: MemberPass,
  svg: string,
  cardRef: Parameters<typeof captureRef>[0],
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `aiaia-pass-${fileSafe(pass.full_name)}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  }
  if (!(await Sharing.isAvailableAsync())) return false;
  const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Save your AIAIA pass' });
  return true;
}
