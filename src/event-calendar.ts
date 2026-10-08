// SPDX-License-Identifier: AGPL-3.0-only
import type { ScheduledEvent, Location } from './types';

/** RFC 5545 text escaping and UTF-8 octet folding; Tokyo times are emitted as UTC. */
export function eventCalendar(events: ScheduledEvent[], locations: Location[]) {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const instant = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SHUORI//Connected Events//EN', 'CALSCALE:GREGORIAN', ...events.flatMap(event => [
    'BEGIN:VEVENT', `UID:${escape(event.id)}@shuori.local`, `DTSTAMP:${stamp}`, `SEQUENCE:${event.version}`,
    `DTSTART:${instant(event.date, event.start)}`, `DTEND:${instant(event.endDate || event.date, event.end)}`,
    `SUMMARY:${escape(event.title)}`, `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : event.status === 'draft' ? 'TENTATIVE' : 'CONFIRMED'}`,
    `LOCATION:${escape(event.locationText || locations.find(location => location.id === event.locationId)?.name || '')}`,
    `DESCRIPTION:${escape([event.description, event.modules.includes('meeting') && event.meeting.url ? `Meeting: ${event.meeting.url}` : '', event.modules.includes('meeting') ? event.meeting.agenda : ''].filter(Boolean).join('\n\n'))}`,
    'END:VEVENT',
  ]), 'END:VCALENDAR'];
  return lines.flatMap(line => {
    const parts: string[] = []; let part = ''; let bytes = 0;
    for (const char of line) { const length = new TextEncoder().encode(char).length; if (bytes + length > 75) { parts.push(part); part = ' '; bytes = 1; } part += char; bytes += length; }
    parts.push(part); return parts;
  }).join('\r\n') + '\r\n';
}

export function downloadEventCalendar(events: ScheduledEvent[], locations: Location[], name = 'events') {
  const url = URL.createObjectURL(new Blob([eventCalendar(events, locations)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `shuori-${name.replace(/[^a-z0-9-]/gi, '-')}.ics`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
