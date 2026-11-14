import type { EventRow } from '@aiaia/api';
import { Linking, Platform } from 'react-native';

type CalEvent = Pick<
  EventRow,
  'id' | 'title' | 'description' | 'starts_at' | 'ends_at' | 'venue_name' | 'venue_address'
>;

function icsStamp(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 calendar file for one event. Times are UTC. */
export function buildIcs(event: CalEvent, now: Date = new Date()): string {
  const location = [event.venue_name, event.venue_address].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AIAIA//Youth App//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@aiaia`,
    `DTSTAMP:${icsStamp(now.toISOString())}`,
    `DTSTART:${icsStamp(event.starts_at)}`,
    `DTEND:${icsStamp(event.ends_at)}`,
    `SUMMARY:${esc(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${esc(event.description)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

export function googleCalendarUrl(event: CalEvent): string {
  const location = [event.venue_name, event.venue_address].filter(Boolean).join(', ');
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${icsStamp(event.starts_at)}/${icsStamp(event.ends_at)}`,
    details: event.description ?? '',
    location,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/**
 * Web downloads the .ics file. Native opens Google Calendar's add-event page (no file-sharing dependency).
 * Decision: on native this shares the event's title, venue and description with Google. A true native
 * .ics would need expo-file-system + expo-sharing.
 */
export async function addToCalendar(event: CalEvent): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aiaia-event.ics';
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Linking.openURL(googleCalendarUrl(event));
}
