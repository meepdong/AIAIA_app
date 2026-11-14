import type { ImportBranch, RosterRowInput } from '@aiaia/api';
import Papa from 'papaparse';
import { z } from 'zod';
import { csvCell } from '@/features/admin/members/csv';

/** The template's columns, in order. */
export const ROSTER_COLUMNS = [
  'full_name',
  'phone',
  'branch',
  'dob',
  'gender',
  'city',
  'occupation',
  'email',
  'guardian_name',
  'guardian_phone',
] as const;
export type RosterColumn = (typeof ROSTER_COLUMNS)[number];

/** Columns a sheet must have. The others may be left out of the file or empty. */
export const REQUIRED_COLUMNS: readonly RosterColumn[] = ['full_name', 'branch'];

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Fake rows only. Kept identical to docs/templates/roster-template.csv (a test checks it). */
export const ROSTER_TEMPLATE_CSV =
  [
    ROSTER_COLUMNS.join(','),
    'Aarav Demokar,+91 90000 00001,Branch A,2001-04-15,male,Sampletown,Student,aarav.demokar@example.test,,',
    'Diya Dummyson,9000000002,Branch A,12/08/2012,female,Sampletown,Student,,Priya Dummyson,+91 90000 00003',
  ].join('\n') + '\n';

/**
 * Normalises an Indian-style phone entry to E.164, or returns null when it cannot be one.
 * Accepts: 10 digits, a leading 0 (trunk prefix), 91 or +91 with or without spaces, a 00 prefix,
 * and other countries' numbers that already start with +.
 */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) {
    // "+91 0 98765 43210": the trunk 0 typed after the country code.
    if (/^\+910[6-9]\d{9}$/.test(s)) return `+91${s.slice(3)}`;
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
  }
  if (/^0[6-9]\d{9}$/.test(s)) return `+91${s.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(s)) return `+${s}`;
  if (/^[6-9]\d{9}$/.test(s)) return `+91${s}`;
  return null;
}

const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** `YYYY-MM-DD` or `DD/MM/YYYY` (also `-` or `.`), a real date from 1900 to today. Returns ISO. */
export function normalizeDob(raw: string): string | null {
  const t = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  } else {
    return null;
  }
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  const out = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (y < 1900 || out > todayIst()) return null;
  return out;
}

const GENDERS: Record<string, string> = {
  m: 'male',
  male: 'male',
  f: 'female',
  female: 'female',
  other: 'other',
  o: 'other',
};

const cell = z.string().trim().optional();

/** What a validated row looks like. The branch is resolved to an id. */
export interface RosterRow extends RosterRowInput {
  gender: string | null;
  city: string | null;
  occupation: string | null;
  email: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
}

function resolveBranch(
  value: string,
  branches: readonly ImportBranch[],
): ImportBranch | 'many' | null {
  const v = value.trim().toLowerCase();
  const byCode = branches.filter((b) => b.code.toLowerCase() === v);
  if (byCode.length === 1) return byCode[0] ?? null;
  const byName = branches.filter((b) => b.name.toLowerCase() === v);
  if (byName.length === 1) return byName[0] ?? null;
  return byCode.length + byName.length > 1 ? 'many' : null;
}

/** The zod schema for one sheet row (strings in, a RosterRow out), given the branches to match. */
export function makeRowSchema(branches: readonly ImportBranch[]) {
  return z
    .object({
      full_name: z
        .string()
        .trim()
        .min(1, 'Name is required')
        .max(120, 'Name is over 120 characters'),
      phone: cell,
      branch: z.string().trim().min(1, 'Branch is required'),
      dob: cell,
      gender: cell,
      city: z.string().trim().max(100, 'City is over 100 characters').optional(),
      occupation: z.string().trim().max(100, 'Occupation is over 100 characters').optional(),
      email: cell,
      guardian_name: z.string().trim().max(120, 'Guardian name is over 120 characters').optional(),
      guardian_phone: cell,
    })
    .transform((v, ctx): RosterRow => {
      const bad = (message: string, path: string) =>
        ctx.addIssue({ code: 'custom', message, path: [path] });

      let branchId = '';
      const b = resolveBranch(v.branch, branches);
      if (b === null) bad(`Branch "${v.branch}" was not found`, 'branch');
      else if (b === 'many') bad(`Branch "${v.branch}" matches more than one branch`, 'branch');
      else branchId = b.id;

      let phone: string | null = null;
      if (v.phone) {
        phone = normalizePhone(v.phone);
        if (!phone) bad('Phone is not a valid number', 'phone');
      }

      let dob: string | null = null;
      if (v.dob) {
        dob = normalizeDob(v.dob);
        if (!dob)
          bad('Date of birth must be a real date (YYYY-MM-DD or DD/MM/YYYY) up to today', 'dob');
      }

      let gender: string | null = null;
      if (v.gender) {
        gender = GENDERS[v.gender.toLowerCase()] ?? null;
        if (!gender) bad('Gender must be male, female or other', 'gender');
      }

      let email: string | null = null;
      if (v.email) {
        if (z.email().safeParse(v.email).success) email = v.email.toLowerCase();
        else bad('Email is not valid', 'email');
      }

      let guardianPhone: string | null = null;
      if (v.guardian_phone) {
        guardianPhone = normalizePhone(v.guardian_phone);
        if (!guardianPhone) bad('Guardian phone is not a valid number', 'guardian_phone');
      }

      return {
        branch_id: branchId,
        full_name: v.full_name,
        phone,
        dob,
        gender,
        city: v.city || null,
        occupation: v.occupation || null,
        email,
        guardian_name: v.guardian_name || null,
        guardian_phone: guardianPhone,
      };
    });
}

export type RowStatus = 'valid' | 'error' | 'duplicate';

export interface PreviewRow {
  /** Row number in the sheet (the header is row 1). */
  line: number;
  status: RowStatus;
  errors: string[];
  /** For a duplicate: the sheet row it repeats. */
  duplicateOf?: number;
  /** The raw name, for display. Never the phone or DOB. */
  name: string;
  /** Present only when status is `valid`. */
  row?: RosterRow;
}

export interface ParsedRoster {
  /** Problems with the file as a whole (no preview is possible). */
  fileErrors: string[];
  rows: PreviewRow[];
}

function duplicateKey(r: RosterRow): string {
  return r.phone ? `p:${r.phone}` : `n:${r.branch_id}|${r.full_name.toLowerCase()}|${r.dob ?? ''}`;
}

/**
 * Parses and validates a roster CSV. Runs in the browser; the text is never sent anywhere.
 * Only rows with status `valid` are meant to be imported. A row that repeats an earlier row's
 * phone (or, with no phone, the same name, branch and date of birth) is flagged `duplicate`.
 */
export function parseRosterCsv(text: string, branches: readonly ImportBranch[]): ParsedRoster {
  const parsed = Papa.parse<Record<string, string | undefined>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  });

  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return { fileErrors: [`Missing column: ${missing.join(', ')}`], rows: [] };
  }
  if (parsed.data.length === 0) return { fileErrors: ['The file has no rows'], rows: [] };
  if (parsed.data.length > MAX_ROWS) {
    return { fileErrors: [`The file has more than ${MAX_ROWS} rows. Split it up.`], rows: [] };
  }

  const schema = makeRowSchema(branches);
  const seen = new Map<string, number>();
  const rows: PreviewRow[] = parsed.data.map((raw, i) => {
    const line = i + 2;
    const name = (raw.full_name ?? '').trim();
    const input: Record<string, string> = {};
    for (const c of ROSTER_COLUMNS) {
      const v = raw[c];
      if (typeof v === 'string' && v.trim() !== '') input[c] = v;
    }
    // A row with fewer cells than the header leaves the rest undefined: treated as empty.
    const res = schema.safeParse({ full_name: '', branch: '', ...input });
    if (!res.success) {
      return { line, status: 'error', name, errors: res.error.issues.map((x) => x.message) };
    }
    const first = seen.get(duplicateKey(res.data));
    if (first !== undefined) {
      return {
        line,
        status: 'duplicate',
        name,
        errors: [`Repeats row ${first}`],
        duplicateOf: first,
      };
    }
    seen.set(duplicateKey(res.data), line);
    return { line, status: 'valid', name, errors: [], row: res.data };
  });

  return { fileErrors: [], rows };
}

export interface PreviewCounts {
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
}

export function countRows(rows: readonly PreviewRow[]): PreviewCounts {
  return {
    total: rows.length,
    valid: rows.filter((r) => r.status === 'valid').length,
    errors: rows.filter((r) => r.status === 'error').length,
    duplicates: rows.filter((r) => r.status === 'duplicate').length,
  };
}

/** The rows `import_roster` takes: valid rows only, and only the fields the RPC reads. */
export function toImportRows(rows: readonly PreviewRow[]): RosterRowInput[] {
  const out: RosterRowInput[] = [];
  for (const p of rows) {
    if (p.status !== 'valid' || !p.row) continue;
    const { branch_id, full_name, phone, dob } = p.row;
    out.push({ branch_id, full_name, phone, dob });
  }
  return out;
}

/** Marks valid rows whose branch the caller may not import into as errors (the RPC would refuse the batch). */
export function applyBranchPermission(
  rows: readonly PreviewRow[],
  canImportInto: (branchId: string) => boolean,
): PreviewRow[] {
  return rows.map((p) =>
    p.status === 'valid' && p.row && !canImportInto(p.row.branch_id)
      ? {
          line: p.line,
          name: p.name,
          status: 'error',
          errors: ['You cannot import into this branch'],
        }
      : p,
  );
}

/**
 * The error report: row number, name, and why. No phone or date of birth, so a copy that is
 * shared by mistake gives away little.
 */
export function buildErrorReportCsv(rows: readonly PreviewRow[]): string {
  const lines = ['row,name,status,problems'];
  for (const p of rows) {
    if (p.status === 'valid') continue;
    lines.push([String(p.line), csvCell(p.name), p.status, csvCell(p.errors.join('; '))].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
