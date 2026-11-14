// pnpm db:start -> supabase start
import { run } from './db-lib.mjs';

run(['start', ...process.argv.slice(2)]);
