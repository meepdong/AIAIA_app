import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ImportBranch } from '@aiaia/api';
import {
  ROSTER_COLUMNS,
  ROSTER_TEMPLATE_CSV,
  applyBranchPermission,
  buildErrorReportCsv,
  countRows,
  normalizeDob,
  normalizePhone,
  parseRosterCsv,
  toImportRows,
} from './roster';

const BRANCH_A: ImportBranch = {
  id: 'c0000000-0000-4000-8000-00000000000a',
  code: 'AAA',
  name: 'Branch A',
};
const BRANCH_B: ImportBranch = {
  id: 'c0000000-0000-4000-8000-00000000000b',
  code: 'BBB',
  name: 'Branch B',
};
const BRANCHES = [BRANCH_A, BRANCH_B];

const HEADER = ROSTER_COLUMNS.join(',');
const csv = (...lines: string[]) => [HEADER, ...lines].join('\n');

describe('phone normalisation', () => {
  it.each(['9876543210', '+91 98765 43210', '098765 43210'])(
    'turns %s into +919876543210',
    (input) => {
      expect(normalizePhone(input)).toBe('+919876543210');
    },
  );

  it.each([
    ['919876543210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    ['0091 98765 43210', '+919876543210'],
    ['(098765) 43210', '+919876543210'],
    ['+44 7700 900123', '+447700900123'],
  ])('also accepts %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['12345', '5876543210', '98765 4321', 'abc', '9.87654E+11', '+0 98765 43210'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe('date of birth', () => {
  it('accepts ISO and day-first dates and returns ISO', () => {
    expect(normalizeDob('2001-04-15')).toBe('2001-04-15');
    expect(normalizeDob('15/04/2001')).toBe('2001-04-15');
    expect(normalizeDob('5-4-2001')).toBe('2001-04-05');
  });

  it.each(['31/02/2020', '2020-13-01', '1899-12-31', '2999-01-01', 'yesterday', ''])(
    'rejects %s',
    (input) => {
      expect(normalizeDob(input)).toBeNull();
    },
  );
});

describe('parseRosterCsv', () => {
  it('rejects a bad-DOB row and keeps the good one', () => {
    const { rows, fileErrors } = parseRosterCsv(
      csv(
        'Aarav Demokar,+91 90000 00001,Branch A,2001-04-15,,,,,,',
        'Diya Dummyson,9000000002,Branch A,31/02/2012,,,,,,',
      ),
      BRANCHES,
    );
    expect(fileErrors).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(['valid', 'error']);
    expect(rows[1]?.line).toBe(3);
    expect(rows[1]?.errors.join(' ')).toMatch(/date of birth/i);
    expect(toImportRows(rows)).toHaveLength(1);
  });

  it('flags a repeated phone as a duplicate of the first row, whatever its format', () => {
    const { rows } = parseRosterCsv(
      csv(
        'Aarav Demokar,9876543210,Branch A,,,,,,,',
        'Ravi Fixture,+91 98765 43210,Branch B,,,,,,,',
        'Meera Mockford,098765 43210,Branch A,,,,,,,',
      ),
      BRANCHES,
    );
    expect(rows.map((r) => r.status)).toEqual(['valid', 'duplicate', 'duplicate']);
    expect(rows[1]?.duplicateOf).toBe(2);
    expect(countRows(rows)).toEqual({ total: 3, valid: 1, errors: 0, duplicates: 2 });
    expect(toImportRows(rows).map((r) => r.full_name)).toEqual(['Aarav Demokar']);
  });

  it('flags a repeated name, branch and date of birth when there is no phone', () => {
    const { rows } = parseRosterCsv(
      csv(
        'Tara Sampleton,,Branch A,2005-01-02,,,,,,',
        'tara sampleton,,AAA,02/01/2005,,,,,,',
        'Tara Sampleton,,Branch B,2005-01-02,,,,,,',
      ),
      BRANCHES,
    );
    expect(rows.map((r) => r.status)).toEqual(['valid', 'duplicate', 'valid']);
  });

  it('matches the branch by name or code, ignoring case, and reports an unknown one', () => {
    const { rows } = parseRosterCsv(
      csv(
        'Isha Testwala,+91 90000 00004,bbb,,,,,,,',
        'Karan Examplar,+91 90000 00005,branch a,,,,,,,',
        'Nina Placeholder,+91 90000 00006,Nowhere,,,,,,,',
      ),
      BRANCHES,
    );
    expect(rows.map((r) => r.row?.branch_id)).toEqual([BRANCH_B.id, BRANCH_A.id, undefined]);
    expect(rows[2]?.status).toBe('error');
    expect(rows[2]?.errors[0]).toMatch(/Branch "Nowhere" was not found/);
  });

  it('checks every field, not only the phone and date', () => {
    const { rows } = parseRosterCsv(
      csv(
        ',+91 90000 00007,Branch A,,,,,,,',
        'Zoya Dummyson,12345,Branch A,,,,,,,',
        'Dev Fixture,+91 90000 00008,Branch A,,robot,,,not-an-email,,',
        'Leela Mockford,+91 90000 00009,Branch A,,,,,,Samir Mockford,nope',
      ),
      BRANCHES,
    );
    expect(rows.map((r) => r.status)).toEqual(['error', 'error', 'error', 'error']);
    expect(rows[0]?.errors).toEqual(['Name is required']);
    expect(rows[1]?.errors).toEqual(['Phone is not a valid number']);
    expect(rows[2]?.errors).toEqual(['Gender must be male, female or other', 'Email is not valid']);
    expect(rows[3]?.errors).toEqual(['Guardian phone is not a valid number']);
  });

  it('sends only the fields import_roster reads', () => {
    const { rows } = parseRosterCsv(
      csv(
        'Neil Sampleton,+91 90000 00010,Branch A,2000-02-29,male,Sampletown,Clerk,neil@example.test,Asha Sampleton,+91 90000 00011',
      ),
      BRANCHES,
    );
    expect(toImportRows(rows)).toEqual([
      {
        branch_id: BRANCH_A.id,
        full_name: 'Neil Sampleton',
        phone: '+919000000010',
        dob: '2000-02-29',
      },
    ]);
  });

  it('copes with a BOM, blank lines, odd header spacing and short rows', () => {
    const { rows, fileErrors } = parseRosterCsv(
      `﻿Full Name, Phone ,Branch\n\nVikram Demokar,+91 90000 00012,Branch A\nRohan Fixture\n`,
      BRANCHES,
    );
    expect(fileErrors).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(['valid', 'error']);
  });

  it('refuses a file without the required columns or without rows', () => {
    expect(parseRosterCsv('phone,city\n+91 90000 00013,Sampletown\n', BRANCHES).fileErrors).toEqual(
      ['Missing column: full_name, branch'],
    );
    expect(parseRosterCsv(`${HEADER}\n`, BRANCHES).fileErrors).toEqual(['The file has no rows']);
  });
});

describe('branch permission and error report', () => {
  it('turns rows for a branch the caller cannot import into into errors', () => {
    const { rows } = parseRosterCsv(
      csv(
        'Arjun Testwala,+91 90000 00014,Branch A,,,,,,,',
        'Asha Examplar,+91 90000 00015,Branch B,,,,,,,',
      ),
      BRANCHES,
    );
    const out = applyBranchPermission(rows, (b) => b === BRANCH_A.id);
    expect(out.map((r) => r.status)).toEqual(['valid', 'error']);
    expect(toImportRows(out)).toHaveLength(1);
  });

  it('lists skipped rows with row number, name and reasons but no phone or date of birth', () => {
    const { rows } = parseRosterCsv(
      csv(
        'Aarav Demokar,+91 90000 00016,Branch A,2001-04-15,,,,,,',
        'Meera Placeholder,+91 90000 00017,Branch A,99/99/2001,,,,,,',
      ),
      BRANCHES,
    );
    const report = buildErrorReportCsv(rows);
    expect(report).toContain('3,Meera Placeholder,error,');
    expect(report).not.toContain('Aarav');
    expect(report).not.toMatch(/9000000|2001/);
  });
});

describe('template', () => {
  it('matches docs/templates/roster-template.csv and imports cleanly', () => {
    const file = readFileSync(
      resolve(__dirname, '../../../../../docs/templates/roster-template.csv'),
      'utf8',
    );
    expect(file.replace(/\r\n/g, '\n')).toBe(ROSTER_TEMPLATE_CSV);
    const { rows, fileErrors } = parseRosterCsv(file, BRANCHES);
    expect(fileErrors).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(['valid', 'valid']);
    expect(file.split('\n')[0]).toBe(
      'full_name,phone,branch,dob,gender,city,occupation,email,guardian_name,guardian_phone',
    );
  });
});
