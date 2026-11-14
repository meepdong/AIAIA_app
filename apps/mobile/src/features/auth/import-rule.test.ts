/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../../..');

const client = "import { getSupabase } from '@/lib/supabase';\nexport const x = getSupabase;\n";
const sdk =
  "import { createClient } from '@supabase/supabase-js';\nexport const x = createClient;\n";
const relative =
  "import { getSupabase } from '../../lib/supabase';\nexport const x = getSupabase;\n";

const feature = 'apps/mobile/src/features/events/Fixture.tsx';
const route = 'apps/mobile/app/(app)/fixture.tsx';
const cases: { name: string; file: string; code: string; flagged: boolean }[] = [
  { name: 'a feature importing @/lib/supabase', file: feature, code: client, flagged: true },
  { name: 'a feature importing the SDK', file: feature, code: sdk, flagged: true },
  { name: 'a feature using a relative path', file: feature, code: relative, flagged: true },
  { name: 'a route importing @/lib/supabase', file: route, code: client, flagged: true },
  { name: 'a route importing the SDK', file: route, code: sdk, flagged: true },
  {
    name: 'useApi.tsx, the one allowed file',
    file: 'apps/mobile/src/features/auth/useApi.tsx',
    code: client,
    flagged: false,
  },
  { name: 'src/lib', file: 'apps/mobile/src/lib/fixture.ts', code: client, flagged: false },
  { name: 'src/lib (SDK)', file: 'apps/mobile/src/lib/fixture.ts', code: sdk, flagged: false },
  { name: 'packages/api', file: 'packages/api/src/fixture.ts', code: sdk, flagged: false },
];

// ESLint runs once, in a plain Node child process, via ESLint#lintText with the repo's own
// config. (Loading ESLint inside the jest-expo sandbox trips its runtime shims.)
const script = `
const { ESLint } = require('eslint');
const items = JSON.parse(process.argv[1]);
const eslint = new ESLint({ cwd: process.cwd() });
Promise.all(items.map(({ file, code }) => eslint.lintText(code, { filePath: file }))).then((all) => {
  process.stdout.write(JSON.stringify(all.map(([r]) => r.messages.filter((m) => m.ruleId === 'no-restricted-imports'))));
});
`;

let results: { severity: number }[][] = [];
beforeAll(() => {
  const items = cases.map((c) => ({ file: path.join(root, c.file), code: c.code }));
  const out = execFileSync(process.execPath, ['-e', script, JSON.stringify(items)], {
    cwd: root,
    encoding: 'utf8',
  });
  results = JSON.parse(out);
});

describe('no-restricted-imports: Supabase stays behind packages/api', () => {
  it.each(cases.map((c, i) => [c.name, i, c.flagged] as const))('%s', (_name, i, flagged) => {
    if (flagged) {
      expect(results[i]).toHaveLength(1);
      expect(results[i]![0]!.severity).toBe(2);
    } else {
      expect(results[i]).toHaveLength(0);
    }
  });
});
