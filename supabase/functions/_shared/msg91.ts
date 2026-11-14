// MSG91 Flow API sender, used as the fallback when WhatsApp fails.
// The DLT-approved template must expose one variable named `otp`.

import type { Fetch, SendResult } from './whatsapp.ts';

export interface Msg91Config {
  authKey: string;
  templateId: string;
}

/** MSG91 wants the number with country code and no +. */
export function toMsg91Number(e164: string): string {
  return e164.replace(/\D/g, '');
}

export async function sendMsg91Otp(
  config: Msg91Config,
  params: { to: string; code: string },
  fetchImpl: Fetch = fetch,
): Promise<SendResult> {
  try {
    const response = await fetchImpl('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: config.authKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: config.templateId,
        short_url: '0',
        recipients: [{ mobiles: toMsg91Number(params.to), otp: params.code }],
      }),
    });
    await response.text().catch(() => '');
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
