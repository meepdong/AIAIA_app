#!/usr/bin/env node
// Generates the Ed25519 key pair for delegate passes (P1-07b).
//
//   node scripts/gen-pass-keys.mjs              writes the public key into apps/mobile/app.config.ts
//   node scripts/gen-pass-keys.mjs --config X   writes it into file X instead
//
// The signing seed is printed ONCE to this terminal and never written to disk. Store it in the
// owner's vault and set it as the function secret:
//   supabase secrets set PASS_SIGNING_PRIVATE_KEY=<value>
// Running this again replaces the key pair: every pass issued before stops verifying in new app
// builds. Run it once per deployment, and rebuild the app afterwards.
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flag = process.argv.indexOf('--config');
const configPath =
  flag > 0 ? resolve(process.argv[flag + 1]) : resolve(root, 'apps/mobile/app.config.ts');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const seed = privateKey.export({ format: 'jwk' }).d; // base64url, 32 bytes
const pub = publicKey.export({ format: 'jwk' }).x; // base64url, 32 bytes

const line = /passPublicKey: '[A-Za-z0-9_-]*'/;
const source = readFileSync(configPath, 'utf8');
if (!line.test(source)) {
  console.error(`No "passPublicKey: '...'" line found in ${configPath}. Nothing written.`);
  process.exit(1);
}
writeFileSync(configPath, source.replace(line, `passPublicKey: '${pub}'`));

console.log(`Public key written to ${configPath}: ${pub}`);
console.log('');
console.log('Signing seed (shown once; store it in the vault, then set the function secret):');
console.log(`  PASS_SIGNING_PRIVATE_KEY=${seed}`);
