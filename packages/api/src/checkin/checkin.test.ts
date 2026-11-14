// Keys are generated at test time; nothing secret is committed. The WebCrypto signer of the
// Edge Function is cross-checked against this format in supabase/functions/member-pass.
import { ed25519 } from '@noble/curves/ed25519';
import { base64UrlEncode, encodePassQr, parsePassQr, passMessage, verifyPass } from './index';

const MEMBER = 'a0000000-0000-4000-8000-000000000009';
const OTHER = 'a0000000-0000-4000-8000-000000000010';

function keyPair(): { privateKey: Uint8Array; publicB64: string } {
  const privateKey = ed25519.utils.randomPrivateKey();
  return { privateKey, publicB64: base64UrlEncode(ed25519.getPublicKey(privateKey)) };
}

function signedQr(privateKey: Uint8Array, memberId: string, version: number): string {
  const sig = ed25519.sign(passMessage(memberId, version), privateKey);
  return encodePassQr(memberId, version, sig);
}

describe('checkin pass verification', () => {
  const keys = keyPair();

  it('a valid pass verifies and yields its member and version', () => {
    const qr = signedQr(keys.privateKey, MEMBER, 3);
    expect(qr).toMatch(/^AIAIA1\.[A-Za-z0-9_-]{22}\.3\.[A-Za-z0-9_-]{86}$/);
    expect(verifyPass(qr, keys.publicB64)).toEqual({ ok: true, memberId: MEMBER, passVersion: 3 });
    expect(verifyPass(qr, keys.publicB64, 3)).toEqual({
      ok: true,
      memberId: MEMBER,
      passVersion: 3,
    });
  });

  it('tampered QR rejected: another member id under the original signature', () => {
    const qr = signedQr(keys.privateKey, MEMBER, 1);
    const forged = signedQr(keys.privateKey, OTHER, 1).split('.')[1];
    const parts = qr.split('.');
    const tampered = [parts[0], forged, parts[2], parts[3]].join('.');
    expect(parsePassQr(tampered)?.memberId).toBe(OTHER);
    expect(verifyPass(tampered, keys.publicB64)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('tampered QR rejected: a raised pass_version under the original signature', () => {
    const parts = signedQr(keys.privateKey, MEMBER, 1).split('.');
    const tampered = [parts[0], parts[1], '2', parts[3]].join('.');
    expect(verifyPass(tampered, keys.publicB64)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('a pass signed by another key is rejected', () => {
    const qr = signedQr(keyPair().privateKey, MEMBER, 1);
    expect(verifyPass(qr, keys.publicB64)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('a stale pass_version is rejected after a reissue', () => {
    const qr = signedQr(keys.privateKey, MEMBER, 1);
    expect(verifyPass(qr, keys.publicB64, 2)).toEqual({ ok: false, reason: 'stale' });
  });

  it('fails closed without a usable public key', () => {
    const qr = signedQr(keys.privateKey, MEMBER, 1);
    expect(verifyPass(qr, '')).toEqual({ ok: false, reason: 'no_key' });
    expect(verifyPass(qr, undefined)).toEqual({ ok: false, reason: 'no_key' });
    expect(verifyPass(qr, keys.publicB64.slice(0, 20))).toEqual({ ok: false, reason: 'no_key' });
  });

  it('rejects malformed and non-canonical encodings', () => {
    const qr = signedQr(keys.privateKey, MEMBER, 7);
    const [prefix, id, version, sig] = qr.split('.') as [string, string, string, string];
    const bad = [
      '',
      'hello',
      qr + '.x',
      ['AIAIA2', id, version, sig].join('.'),
      [prefix, id, '07', sig].join('.'),
      [prefix, id, '0', sig].join('.'),
      [prefix, id, '-7', sig].join('.'),
      [prefix, id, version, sig.slice(0, -1)].join('.'),
      [prefix, id + 'A', version, sig].join('.'),
      [prefix, id.slice(0, -1) + (id.endsWith('A') ? 'B' : 'A'), version, sig].join('.'),
      [prefix, id, version, sig + '='].join('.'),
    ];
    for (const text of bad) {
      expect(verifyPass(text, keys.publicB64).ok).toBe(false);
    }
  });

  it('the format refuses to encode a bad member id or version', () => {
    const sig = new Uint8Array(64);
    expect(() => encodePassQr(MEMBER.toUpperCase(), 1, sig)).toThrow();
    expect(() => encodePassQr(MEMBER, 0, sig)).toThrow();
    expect(() => encodePassQr(MEMBER, 1, new Uint8Array(63))).toThrow();
  });
});
