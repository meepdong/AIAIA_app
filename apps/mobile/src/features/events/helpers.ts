import { formatDateTime } from '@aiaia/shared';
import type { EventRow, RsvpStatus } from '@aiaia/api';

export type SpotsInfo = { going: number; waitlisted: number };

/** Null capacity means no limit. Never negative. */
export function spotsLeft(capacity: number | null, going: number): number | null {
  return capacity == null ? null : Math.max(0, capacity - going);
}

export function spotsText(capacity: number | null, spots: SpotsInfo | undefined): string {
  if (capacity == null) return 'Open to everyone, no spot limit';
  const left = spotsLeft(capacity, spots?.going ?? 0) as number;
  if (left === 0) {
    const w = spots?.waitlisted ?? 0;
    return w > 0 ? `Full, ${w} on the waitlist` : 'Full, join the waitlist';
  }
  return `${left} ${left === 1 ? 'spot' : 'spots'} left of ${capacity}`;
}

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  going: 'Going',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
};

export const RSVP_TONE: Record<RsvpStatus, 'success' | 'warning' | 'neutral'> = {
  going: 'success',
  waitlisted: 'warning',
  cancelled: 'neutral',
};

export function asRsvpStatus(value: string | undefined): RsvpStatus | undefined {
  return value === 'going' || value === 'waitlisted' || value === 'cancelled' ? value : undefined;
}

export type RegistrationState = 'open' | 'not_yet' | 'closed' | 'cancelled';

export function registrationState(event: EventRow, now: Date = new Date()): RegistrationState {
  if (event.status === 'cancelled') return 'cancelled';
  const t = now.getTime();
  if (event.registration_opens_at && new Date(event.registration_opens_at).getTime() > t) {
    return 'not_yet';
  }
  const closes = event.registration_closes_at ?? event.ends_at;
  return new Date(closes).getTime() <= t ? 'closed' : 'open';
}

export function whenText(event: Pick<EventRow, 'starts_at' | 'ends_at'>): string {
  return `${formatDateTime(event.starts_at)} to ${formatDateTime(event.ends_at)}`;
}

/** Only http(s) links are opened; officers type this field. */
export function safeMapUrl(event: Pick<EventRow, 'map_url' | 'venue_name' | 'venue_address'>) {
  const raw = event.map_url?.trim();
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  const place = [event.venue_name, event.venue_address].filter(Boolean).join(', ');
  return place
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
    : null;
}

export const CAPABILITY_LABEL: Record<string, string> = {
  check_in: 'Check-in',
  collect_payments: 'Collect payments',
  safety_lead: 'Safety lead',
};
