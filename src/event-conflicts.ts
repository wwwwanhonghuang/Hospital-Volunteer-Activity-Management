// SPDX-License-Identifier: AGPL-3.0-only
import type { AppState, ScheduledEvent } from './types';

/** Half-open JST intervals allow an event to end exactly when another begins. */
export function eventConflicts(event: ScheduledEvent, data: AppState) {
  if (event.status === 'cancelled' || !event.volunteerIds.length) return [];
  const start = `${event.date}T${event.start}`;
  const end = `${event.endDate || event.date}T${event.end}`;
  const candidates = [
    ...data.shifts.filter(shift => !event.shiftIds.includes(shift.id)).map(shift => ({ ...shift, endDate: shift.date, kind: 'Service shift' })),
    ...data.events.filter(other => other.id !== event.id).map(other => ({ ...other, kind: 'Event' })),
  ];
  return candidates.filter(other => other.status !== 'cancelled' && `${other.date}T${other.start}` < end && `${other.endDate}T${other.end}` > start)
    .map(other => ({ id: other.id, kind: other.kind, title: other.title, date: other.date, endDate: other.endDate, start: other.start, end: other.end,
      people: other.volunteerIds.filter(id => event.volunteerIds.includes(id)).map(id => data.volunteers.find(volunteer => volunteer.id === id)?.name || id),
    })).filter(other => other.people.length).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
}
