import type { EventAttendee } from '@aiaia/api';
import { formatDateTime } from '@aiaia/shared';
import { Platform, Share } from 'react-native';

export const ATTENDEE_COLUMNS = [
  'Member no',
  'Name',
  'Branch',
  'RSVP status',
  'Registered at (IST)',
  'Registered by guardian',
] as const;

/** Quotes a cell, and defuses spreadsheet formulas (a leading = + - @ would run when opened). */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Name, member number, branch and RSVP only: no phone, email or date of birth. */
export function attendeesCsv(rows: readonly EventAttendee[]): string {
  const lines: string[] = [ATTENDEE_COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.member_no,
        r.full_name,
        r.branch_name,
        r.status,
        formatDateTime(r.registered_at),
        r.registered_by_guardian ? 'yes' : 'no',
      ]
        .map((c) => cell(String(c ?? '')))
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

export function attendeeCounts(rows: readonly EventAttendee[]) {
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return { going: count('going'), waitlisted: count('waitlisted'), cancelled: count('cancelled') };
}

/** Web downloads a file. Native opens the share sheet. The rows are never logged. */
export async function exportCsv(csv: string, filename: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: filename, message: csv });
}
