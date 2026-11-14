import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../../../../../scripts/gen-pass-keys.mjs');

describe('gen-pass-keys.mjs', () => {
  it('refuses to run in CI or with output captured, and prints no key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiaia-keys-'));
    try {
      const config = join(dir, 'app.config.ts');
      const original = "extra: { passPublicKey: '' }\n";
      writeFileSync(config, original);
      // A clean environment: no GIT_* variables, nothing from the developer's shell.
      const env: Record<string, string> = { CI: '1' };
      if (process.env.PATH) env.PATH = process.env.PATH;
      if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
      const run = spawnSync(process.execPath, [SCRIPT, '--config', config], {
        env,
        encoding: 'utf8',
      });
      expect(run.status).not.toBe(0);
      const output = `${run.stdout}${run.stderr}`;
      expect(output).not.toMatch(/PASS_SIGNING_PRIVATE_KEY=/);
      expect(output).not.toMatch(/[A-Za-z0-9_-]{43}/);
      expect(output).toMatch(/Refusing to run/);
      // And it wrote nothing.
      expect(readFileSync(config, 'utf8')).toBe(original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
