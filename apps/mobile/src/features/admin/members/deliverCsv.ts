import { Platform } from 'react-native';

/**
 * Web only: a Blob download. There is deliberately no native path: the CSV can hold minors'
 * contact details, and the system share sheet would hand it to any app (WhatsApp and the like).
 */
export async function deliverCsv(filename: string, csv: string): Promise<void> {
  if (Platform.OS !== 'web') throw new Error('CSV export is available on the web console only');
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
