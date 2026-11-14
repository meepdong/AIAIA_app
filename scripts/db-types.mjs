// pnpm db:types -> regenerates packages/shared/src/db.types.ts from the local database.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { repoRoot, supabase } from './db-lib.mjs';

const out = join(repoRoot, 'packages', 'shared', 'src', 'db.types.ts');
const { status, stdout } = supabase(
  ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
  {
    capture: true,
  },
);
if (status !== 0 || !stdout) {
  console.error('supabase gen types failed; is the local stack running (pnpm db:start)?');
  process.exit(status || 1);
}
mkdirSync(dirname(out), { recursive: true });
// Written by Node (UTF-8, LF) rather than shell redirection, which is UTF-16 in Windows PowerShell.
writeFileSync(out, stdout.replace(/\r\n/g, '\n'), 'utf8');
console.log(`Wrote ${out}`);
