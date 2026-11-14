import type { ExportRow } from '@aiaia/api';

const COLUMNS: { header: string; value: (r: ExportRow) => unknown; contact?: boolean }[] = [
  { header: 'Member no', value: (r) => r.member_no },
  { header: 'Name', value: (r) => r.full_name },
  { header: 'Branch code', value: (r) => r.branch_code },
  { header: 'Branch', value: (r) => r.branch_name },
  { header: 'Wing', value: (r) => r.wing },
  { header: 'Status', value: (r) => r.status },
  { header: 'Gender', value: (r) => r.gender },
  { header: 'City', value: (r) => r.city },
  { header: 'Approved at', value: (r) => r.approved_at },
  { header: 'Minor', value: (r) => (r.is_minor ? 'yes' : 'no') },
  { header: 'Has login', value: (r) => (r.has_login ? 'yes' : 'no') },
  { header: 'Contacts withheld', value: (r) => (r.contacts_withheld ? 'yes' : 'no') },
  { header: 'Phone', value: (r) => r.phone, contact: true },
  { header: 'Email', value: (r) => r.email, contact: true },
  { header: 'Date of birth', value: (r) => r.dob, contact: true },
];

/** Plain phone numbers, dates and numbers start with + or - but are not formulas. */
const NUMBERISH = /^[+-]?[\d][\d\s-]*$/;

/** Quotes a cell and defuses spreadsheet formulas (a member can type `=...` as their name). */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !NUMBERISH.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Builds the export CSV on the device. Contact cells are always empty for withheld rows, even if
 * a row somehow arrives with values.
 */
export function buildMembersCsv(rows: readonly ExportRow[]): string {
  const lines = [COLUMNS.map((c) => csvCell(c.header)).join(',')];
  for (const r of rows) {
    lines.push(
      COLUMNS.map((c) => (c.contact && r.contacts_withheld ? '' : csvCell(c.value(r)))).join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
