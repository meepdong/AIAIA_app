// Supabase Auth "Send SMS" hook. Dependency-injected so the tests run without a network or a
// database; index.ts wires the real WhatsApp, MSG91 and Postgres pieces.
//
// Privacy: this file never logs the code or the phone number, not even partially. Every log
// line carries only a provider name and an HTTP status.

import { verifyWebhook } from '../_shared/standard-webhooks.ts';
import type { SendResult } from '../_shared/whatsapp.ts';

export const WHATSAPP_TEMPLATE = 'aiaia_login_code';
export const MAX_PER_HOUR = 5;
export const MAX_PER_DAY = 10;
export const THROTTLE_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface ThrottleStore {
  /** Send times for this phone hash since `since`, oldest first. */
  sentSince(phoneHash: string, since: Date): Promise<Date[]>;
  record(phoneHash: string, at: Date): Promise<void>;
  purgeOlderThan(cutoff: Date): Promise<void>;
}

export interface HandlerDeps {
  hookSecret: string;
  /** Function secret that keys the phone hash (HMAC-SHA256), so stored hashes cannot be enumerated. */
  throttleKey: string;
  store: ThrottleStore;
  /** Undefined when WhatsApp is not configured. */
  sendWhatsApp?: (to: string, code: string) => Promise<SendResult>;
  /** Undefined when MSG91 is not configured. */
  sendMsg91?: (to: string, code: string) => Promise<SendResult>;
  allowInternational: boolean;
  now?: () => number;
  random?: () => number;
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function hashPhone(throttleKey: string, e164: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(throttleKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(e164)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

function minutesUntil(retryAtMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((retryAtMs - nowMs) / 60_000));
}

interface HookPayload {
  user?: { phone?: unknown };
  sms?: { otp?: unknown };
}

export function createHandler(deps: HandlerDeps): (request: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;

  return async (request) => {
    if (request.method !== 'POST') return errorResponse(405, 'Method not allowed');

    const body = await request.text();
    const verified = await verifyWebhook(deps.hookSecret, request.headers, body, { now: now() });
    if (!verified.ok) return errorResponse(401, 'Invalid signature');

    let payload: HookPayload;
    try {
      payload = JSON.parse(body) as HookPayload;
    } catch {
      return errorResponse(400, 'Invalid request');
    }
    const rawPhone = payload.user?.phone;
    const code = payload.sms?.otp;
    if (typeof rawPhone !== 'string' || typeof code !== 'string' || code.length === 0) {
      return errorResponse(400, 'Invalid request');
    }
    // Supabase sends 919000000001; we work with +919000000001.
    const phone = `+${rawPhone.replace(/\D/g, '')}`;
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return errorResponse(400, 'Invalid phone number');

    if (!phone.startsWith('+91') && !deps.allowInternational) {
      return errorResponse(400, 'Only Indian mobile numbers (+91) can sign in for now.');
    }

    const phoneHash = await hashPhone(deps.throttleKey, phone);
    const nowMs = now();
    const sent = await deps.store.sentSince(phoneHash, new Date(nowMs - DAY_MS));
    const inLastHour = sent.filter((at) => nowMs - at.getTime() < HOUR_MS);
    const hourBlocked = inLastHour.length >= MAX_PER_HOUR;
    const dayBlocked = sent.length >= MAX_PER_DAY;
    if (hourBlocked || dayBlocked) {
      // Wait until the oldest send that still counts against the limit ages out.
      const hourRetry = hourBlocked
        ? inLastHour[inLastHour.length - MAX_PER_HOUR].getTime() + HOUR_MS
        : 0;
      const dayRetry = dayBlocked ? sent[sent.length - MAX_PER_DAY].getTime() + DAY_MS : 0;
      const minutes = minutesUntil(Math.max(hourRetry, dayRetry), nowMs);
      return errorResponse(
        429,
        `Too many codes requested. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
      );
    }

    // Counted before sending, so a failing provider cannot be used to burn through messages.
    await deps.store.record(phoneHash, new Date(nowMs));
    if (random() < 0.1) {
      try {
        await deps.store.purgeOlderThan(new Date(nowMs - THROTTLE_RETENTION_MS));
      } catch {
        console.error('auth-send-otp: throttle purge failed');
      }
    }

    if (deps.sendWhatsApp) {
      const result = await deps.sendWhatsApp(phone, code);
      if (result.ok) return new Response('{}', { status: 200 });
      console.error(`auth-send-otp: whatsapp failed (status ${result.status})`);
    }
    if (deps.sendMsg91) {
      const result = await deps.sendMsg91(phone, code);
      if (result.ok) return new Response('{}', { status: 200 });
      console.error(`auth-send-otp: msg91 failed (status ${result.status})`);
    }
    return errorResponse(502, 'We could not send the code. Please try again shortly.');
  };
}
