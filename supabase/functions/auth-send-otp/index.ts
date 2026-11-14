// Entry point for the Supabase Auth "Send SMS" hook (config: [auth.hook.send_sms]).
// Secrets (function secrets, never in the repo):
//   SEND_SMS_HOOK_SECRET   the hook's signing secret, `v1,whsec_...` as shown by Supabase
//   OTP_THROTTLE_KEY       random string that keys the phone hash in otp_throttle
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID          WhatsApp Cloud API (owner items B1/B2)
//   MSG91_AUTH_KEY, MSG91_TEMPLATE_ID                 optional fallback (owner item B3)
//   ALLOW_INTERNATIONAL_OTP=true                      optional, allows non +91 numbers
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendMsg91Otp } from '../_shared/msg91.ts';
import { sendWhatsAppAuthTemplate } from '../_shared/whatsapp.ts';
import { createHandler, WHATSAPP_TEMPLATE } from './handler.ts';
import { createPostgresThrottleStore, type ThrottleTableClient } from './throttle.ts';

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`auth-send-otp: ${name} is not set`);
  return value;
}

const whatsappToken = Deno.env.get('WHATSAPP_TOKEN');
const whatsappPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const msg91Key = Deno.env.get('MSG91_AUTH_KEY');
const msg91Template = Deno.env.get('MSG91_TEMPLATE_ID');

const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = createHandler({
  hookSecret: required('SEND_SMS_HOOK_SECRET'),
  throttleKey: required('OTP_THROTTLE_KEY'),
  store: createPostgresThrottleStore(supabase as unknown as ThrottleTableClient),
  allowInternational: Deno.env.get('ALLOW_INTERNATIONAL_OTP') === 'true',
  sendWhatsApp:
    whatsappToken && whatsappPhoneId
      ? (to, code) =>
          sendWhatsAppAuthTemplate(
            { accessToken: whatsappToken, phoneNumberId: whatsappPhoneId },
            { to, template: WHATSAPP_TEMPLATE, code },
          )
      : undefined,
  sendMsg91:
    msg91Key && msg91Template
      ? (to, code) => sendMsg91Otp({ authKey: msg91Key, templateId: msg91Template }, { to, code })
      : undefined,
});

Deno.serve(handler);
