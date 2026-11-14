import type { EventAudience, EventInput, EventRow } from '@aiaia/api';
import { toKolkataParts } from '@aiaia/shared';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The form's raw field values. Dates are typed as `YYYY-MM-DD HH:mm` in Asia/Kolkata. */
export type EventFormValues = {
  title: string;
  description: string;
  scope: 'national' | 'branch';
  branchId: string;
  audience: EventAudience;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
  capacity: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
};

export type EventFormErrors = Partial<Record<keyof EventFormValues, string>>;

export const EMPTY_FORM: EventFormValues = {
  title: '',
  description: '',
  scope: 'national',
  branchId: '',
  audience: 'youth',
  startsAt: '',
  endsAt: '',
  venueName: '',
  venueAddress: '',
  mapUrl: '',
  capacity: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
};

/** `2026-12-01 18:30` (Asia/Kolkata) to an ISO instant, or null when it is not a real date and time. */
export function parseIst(text: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(utc);
  const real =
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === mo - 1 &&
    check.getUTCDate() === d &&
    check.getUTCHours() === h &&
    check.getUTCMinutes() === mi;
  return real ? new Date(utc - IST_OFFSET_MS).toISOString() : null;
}

/** An ISO instant as `YYYY-MM-DD HH:mm` in Asia/Kolkata. Empty for null. */
export function formatIst(iso: string | null): string {
  if (!iso) return '';
  const p = toKolkataParts(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${two(p.month)}-${two(p.day)} ${two(p.hour)}:${two(p.minute)}`;
}

/** The table accepts only https links; anything else (javascript:, data:, http:) is refused. */
export function isSafeMapUrl(value: string): boolean {
  return /^https:\/\/\S+$/i.test(value) && value.length <= 1000;
}

export function formFromEvent(e: EventRow): EventFormValues {
  return {
    title: e.title,
    description: e.description ?? '',
    scope: e.scope === 'branch' ? 'branch' : 'national',
    branchId: e.branch_id ?? '',
    audience: e.audience,
    startsAt: formatIst(e.starts_at),
    endsAt: formatIst(e.ends_at),
    venueName: e.venue_name ?? '',
    venueAddress: e.venue_address ?? '',
    mapUrl: e.map_url ?? '',
    capacity: e.capacity == null ? '' : String(e.capacity),
    registrationOpensAt: formatIst(e.registration_opens_at),
    registrationClosesAt: formatIst(e.registration_closes_at),
  };
}

const DATE_HINT = 'Use YYYY-MM-DD HH:mm, for example 2026-12-01 18:30';

export type ValidationResult =
  { ok: true; input: EventInput } | { ok: false; errors: EventFormErrors };

const ms = (iso: string) => new Date(iso).getTime();

/** Mirrors the table checks so officers see the problem before the server refuses it. */
export function validateEventForm(v: EventFormValues): ValidationResult {
  const errors: EventFormErrors = {};
  const title = v.title.trim();
  if (title.length === 0) errors.title = 'Enter a title';
  else if (title.length > 200) errors.title = 'Keep the title under 200 characters';
  if (v.description.length > 10000) {
    errors.description = 'Keep the description under 10,000 characters';
  }
  if (v.venueName.length > 200) errors.venueName = 'Keep the venue name under 200 characters';
  if (v.venueAddress.length > 500) errors.venueAddress = 'Keep the address under 500 characters';

  if (v.scope === 'branch' && !v.branchId) errors.branchId = 'Choose a branch for a branch event';

  const starts = parseIst(v.startsAt);
  const ends = parseIst(v.endsAt);
  if (!starts) errors.startsAt = DATE_HINT;
  if (!ends) errors.endsAt = DATE_HINT;
  if (starts && ends && ms(ends) <= ms(starts)) {
    errors.endsAt = 'The event must end after it starts';
  }

  const opensText = v.registrationOpensAt.trim();
  const closesText = v.registrationClosesAt.trim();
  const opens = opensText ? parseIst(opensText) : null;
  const closes = closesText ? parseIst(closesText) : null;
  if (opensText && !opens) errors.registrationOpensAt = DATE_HINT;
  if (closesText && !closes) errors.registrationClosesAt = DATE_HINT;
  if (closes && starts && ms(closes) > ms(starts)) {
    errors.registrationClosesAt = 'Registration must close before the event starts';
  }
  if (opens && closes && ms(closes) < ms(opens)) {
    errors.registrationClosesAt = 'Registration must close after it opens';
  }

  const mapUrl = v.mapUrl.trim();
  if (mapUrl && !isSafeMapUrl(mapUrl)) errors.mapUrl = 'The map link must start with https://';

  const capText = v.capacity.trim();
  let capacity: number | null = null;
  if (capText) {
    if (!/^\d+$/.test(capText) || Number(capText) < 1) {
      errors.capacity = 'Use a whole number above 0, or leave empty for no limit';
    } else {
      capacity = Number(capText);
    }
  }

  if (Object.keys(errors).length > 0 || !starts || !ends) return { ok: false, errors };
  return {
    ok: true,
    input: {
      scope: v.scope,
      branch_id: v.scope === 'branch' ? v.branchId : null,
      audience: v.audience,
      title,
      description: v.description.trim() || null,
      starts_at: starts,
      ends_at: ends,
      venue_name: v.venueName.trim() || null,
      venue_address: v.venueAddress.trim() || null,
      map_url: mapUrl || null,
      capacity,
      registration_opens_at: opens,
      registration_closes_at: closes,
    },
  };
}
