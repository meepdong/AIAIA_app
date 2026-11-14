// pnpm db:stop -> supabase stop
import { run } from './db-lib.mjs';

run(['stop', ...process.argv.slice(2)]);
