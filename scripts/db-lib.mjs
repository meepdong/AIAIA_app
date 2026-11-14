// Shared helper for the db:* scripts: runs the Supabase CLI from the repo root, cross-platform.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function supabase(args, { capture = false } = {}) {
  const result = spawnSync('supabase', args, {
    cwd: repoRoot,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // Windows installs the CLI as a .cmd/.exe shim; args here are fixed strings, never user input.
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(
      `Could not run the Supabase CLI (${result.error.message}). Install it (Windows: scoop install supabase) and make sure Docker is running.`,
    );
    process.exit(1);
  }
  return result;
}

export function run(args) {
  const { status } = supabase(args);
  process.exit(status ?? 1);
}
