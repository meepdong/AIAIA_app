/**
 * The number being verified, handed from the phone screen to the OTP screen in memory. It is kept
 * out of the route URL on purpose: on web a URL ends up in history and logs, and members include
 * minors. A reload on the OTP screen loses it, and the screen then sends the member back to /phone.
 */
let pending: string | null = null;

export const setPendingPhone = (e164: string | null) => {
  pending = e164;
};
export const getPendingPhone = () => pending;

/** "+919000000001" -> "+91 90000 00001" */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** Indian mobile numbers are 10 digits starting 6-9. */
export const isValidIndianMobile = (national: string) => /^[6-9]\d{9}$/.test(national);
