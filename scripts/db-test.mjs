// pnpm db:test -> supabase test db
import { run } from './db-lib.mjs';

run(['test', 'db', ...process.argv.slice(2)]);
