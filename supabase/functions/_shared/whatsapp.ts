// WhatsApp Cloud API (Meta Graph API) sender for authentication templates.
// Message text never carries anything but the one-time code; callers must not log it.

export type Fetch = typeof fetch;

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  /** Graph API version, for example v21.0. */
  apiVersion?: string;
}

export interface SendResult {
  ok: boolean;
  /** HTTP status of the provider, or 0 when the request itself failed. Never the response body. */
  status: number;
}

/** Strips the leading + and any formatting: the Graph API wants digits only (919000000001). */
export function toWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, '');
}

/**
 * Sends an AUTHENTICATION template (a body variable and a copy-code button, both carrying the
 * code). The template language defaults to en.
 */
export async function sendWhatsAppAuthTemplate(
  config: WhatsAppConfig,
  params: { to: string; template: string; code: string; language?: string },
  fetchImpl: Fetch = fetch,
): Promise<SendResult> {
  const version = config.apiVersion ?? 'v21.0';
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: toWhatsAppNumber(params.to),
    type: 'template',
    template: {
      name: params.template,
      language: { code: params.language ?? 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: params.code }] },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: params.code }],
        },
      ],
    },
  };
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    // Drain the body so the connection is released; it is never logged or returned.
    await response.text().catch(() => '');
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
