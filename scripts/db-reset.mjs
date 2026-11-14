// pnpm db:reset -> supabase db reset
import { run } from './db-lib.mjs';

run(['db', 'reset', ...process.argv.slice(2)]);
