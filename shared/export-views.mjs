// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

export const VIEW_LIMITS = Object.freeze({ days: 31, items: 500, people: 250, textCharacters: 600000, bars: 8000 });
const views = ['volunteer-timeline', 'station-timeline', 'weekly-roster', 'event-brief', 'event-agenda'];
const statuses = ['draft', 'confirmed', 'active', 'completed', 'cancelled'];
const dayMs = 86400000;
const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const isoDay = value => new Date(`${value}T00:00:00Z`).getTime();
const date = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Choose a valid calendar date.');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const ids = z.array(z.string().min(1).max(160)).max(500).refine(value => new Set(value).size === value.length, 'Choose each record only once.');
const schema = z.object({
  view: z.enum(views), dateFrom: date.optional(), dateTo: date.optional(),
  timeFrom: time.default('08:00'), timeTo: z.union([time, z.literal('24:00')]).default('18:00'),
  slotMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30), paper: z.enum(['A4', 'A3']).default('A4'),
  includeEvents: z.boolean().default(true), includeIdle: z.boolean().default(false),
  includeNotes: z.boolean().default(false), includeCustomFields: z.boolean().default(false),
  statuses: z.array(z.enum(statuses)).min(1).max(5).refine(value => new Set(value).size === value.length).default(statuses.slice(0, 4)),
  eventId: z.string().min(1).max(160).optional(), eventIds: ids.optional(), volunteerIds: ids.optional(), locationIds: ids.optional(),
}).strict().superRefine((request, context) => {
  const fail = message => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (minute(request.timeFrom) >= minute(request.timeTo)) fail('The time window must end after it starts.');
  if (request.view === 'event-brief') {
    if (!request.eventId) fail('Choose an event for its briefing sheet.');
    if (request.eventIds || request.volunteerIds || request.locationIds) fail('An event brief cannot be filtered by other records.');
  } else {
    if (request.eventId) fail('An event ID is only supported for an event brief.');
    if (request.dateFrom && request.dateTo && request.dateTo < request.dateFrom) fail('End date must be on or after the start date.');
    if (request.dateFrom && request.dateTo && (isoDay(request.dateTo) - isoDay(request.dateFrom)) / dayMs >= VIEW_LIMITS.days) fail('Export up to 31 calendar days at a time.');
  }
  if (request.eventIds && request.view !== 'event-agenda') fail('An exact event selection is supported only for an event agenda.');
});
function error(status, message) { const failure = new Error(message); failure.status = status; throw failure; }
export function parseViewRequest(input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) error(400, parsed.error.issues.map(issue => issue.message).join(' '));
  return parsed.data;
}
const round = value => Math.round(value * 100) / 100;
const pretty = value => String(value || '').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const mapById = values => new Map((values || []).map(value => [value.id, value]));
const active = item => item.status !== 'cancelled';
const interval = item => [isoDay(item.date) / 60000 + minute(item.start), isoDay(item.endDate) / 60000 + minute(item.end)];
function intersection(a, b) { return a[0] < b[1] && b[0] < a[1]; }
function occupiedHours(bars) {
  const periods = bars.filter(active).map(bar => [bar.startMinute, bar.endMinute]).sort((a, b) => a[0] - b[0]);
  let total = 0, from = -1, to = -1;
  for (const [start, end] of periods) {
    if (start > to) { total += Math.max(0, to - from); from = start; to = end; }
    else to = Math.max(to, end);
  }
  return round((total + Math.max(0, to - from)) / 60);
}
function lanesFor(bars) {
  const lanes = [];
  for (const bar of [...bars].sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute || a.key.localeCompare(b.key))) {
    let lane = lanes.find(value => value.at(-1).endMinute <= bar.startMinute);
    if (!lane) { lane = []; lanes.push(lane); }
    lane.push(bar);
  }
  return lanes;
}

/** One bounded, read-only snapshot drives preview, PDF and spreadsheet views.
 * Explicit allowlists keep credentials, contact/health records and file bytes out.
 */
export function buildViewReport(state, input, options = {}) {
  const request = parseViewRequest(input), now = options.now || new Date();
  const peopleById = mapById(state.volunteers), locations = mapById(state.locations), events = mapById(state.events);
  const lookup = (values, ids, label) => {
    if (ids === undefined) return;
    if (ids.some(id => !values.has(id))) error(400, `Some selected ${label} no longer exist. Refresh and export again.`);
  };
  lookup(peopleById, request.volunteerIds, 'volunteers'); lookup(locations, request.locationIds, 'locations'); lookup(events, request.eventIds, 'events');
  const selectedEvent = request.eventId ? events.get(request.eventId) : null;
  if (request.view === 'event-brief' && !selectedEvent) error(404, 'The selected event no longer exists.');
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
  const agendaSelection = request.view === 'event-agenda' ? (state.events || []).filter(event => (request.eventIds === undefined || request.eventIds.includes(event.id))
    && request.statuses.includes(event.status) && (request.volunteerIds === undefined || event.volunteerIds.some(id => request.volunteerIds.includes(id)))
    && (request.locationIds === undefined || request.locationIds.includes(event.locationId))) : [];
  const dateFrom = selectedEvent?.date || request.dateFrom || (agendaSelection.length ? agendaSelection.map(event => event.date).sort()[0] : today);
  const dateTo = selectedEvent?.endDate || request.dateTo || (request.view === 'event-agenda' && !request.dateFrom && agendaSelection.length ? agendaSelection.map(event => event.endDate).sort().at(-1) : dateFrom);
  const dayCount = (isoDay(dateTo) - isoDay(dateFrom)) / dayMs + 1;
  if (dayCount < 1 || (!selectedEvent && dayCount > VIEW_LIMITS.days)) error(400, 'Choose a date range of 1 to 31 calendar days.');
  const days = selectedEvent ? [selectedEvent.date] : Array.from({ length: dayCount }, (_, index) => new Date(isoDay(dateFrom) + index * dayMs).toISOString().slice(0, 10));
  const graphical = ['volunteer-timeline', 'station-timeline', 'weekly-roster'].includes(request.view);
  const startMinute = graphical ? minute(request.timeFrom) : 0, endMinute = graphical ? minute(request.timeTo) : 1440;
  const selectedPeople = request.volunteerIds === undefined ? null : new Set(request.volunteerIds);
  const selectedLocations = request.locationIds === undefined ? null : new Set(request.locationIds);
  const fits = item => request.statuses.includes(item.status) && item.date <= dateTo && (item.endDate || item.date) >= dateFrom
    && (!selectedPeople || item.volunteerIds.some(id => selectedPeople.has(id))) && (!selectedLocations || selectedLocations.has(item.locationId));
  const shifts = ['event-brief', 'event-agenda'].includes(request.view) ? [] : (state.shifts || []).filter(fits);
  const scheduled = selectedEvent ? [selectedEvent] : (request.includeEvents || request.view === 'event-agenda')
    ? (state.events || []).filter(event => fits(event) && (request.eventIds === undefined || request.eventIds.includes(event.id))) : [];
  if (shifts.length + scheduled.length > VIEW_LIMITS.items) error(413, 'This view contains more than 500 activities. Narrow its dates or filters.');
  const raw = [...shifts.map(value => ({ value, kind: 'shift' })), ...scheduled.map(value => ({ value, kind: 'event' }))]
    .sort((a, b) => `${a.value.date} ${a.value.start}`.localeCompare(`${b.value.date} ${b.value.start}`) || a.value.id.localeCompare(b.value.id));
  let shiftNumber = 0, eventNumber = 0;
  const items = raw.map(({ value, kind }) => ({
    key: `${kind === 'shift' ? 'S' : 'E'}${String(kind === 'shift' ? ++shiftNumber : ++eventNumber).padStart(2, '0')}`,
    id: value.id, kind, title: value.title, date: value.date, endDate: value.endDate || value.date, start: value.start, end: value.end,
    status: value.status, locationId: value.locationId || (value.locationText ? `_text:${value.locationText}` : '_unspecified'), location: locations.get(value.locationId)?.name || (kind === 'event' ? value.locationText : '') || 'Location to be confirmed',
    people: value.volunteerIds.map(id => ({ id, name: peopleById.get(id)?.name || id })), notes: request.includeNotes ? (kind === 'shift' ? value.notes : value.description) || '' : '',
    requiredCount: kind === 'shift' ? value.requiredCount : null,
    openPlaces: kind === 'shift' && value.status !== 'cancelled' ? Math.max(0, value.requiredCount - value.volunteerIds.length) : 0,
    conflict: false, conflictWith: [],
  }));
  for (let index = 0; index < items.length; index++) {
    const a = items[index];
    if (!active(a)) continue;
    for (let other = index + 1; other < items.length; other++) {
      const b = items[other];
      if (!active(b) || !intersection(interval(a), interval(b)) || !a.people.some(person => b.people.some(candidate => candidate.id === person.id))) continue;
      const linked = a.kind !== b.kind && (a.kind === 'event' ? events.get(a.id)?.shiftIds.includes(b.id) : events.get(b.id)?.shiftIds.includes(a.id));
      if (linked) continue;
      a.conflict = b.conflict = true; a.conflictWith.push(b.key); b.conflictWith.push(a.key);
    }
  }
  const usedPeople = new Set(items.flatMap(item => item.people.map(person => person.id)));
  if (request.includeIdle && ['volunteer-timeline', 'weekly-roster'].includes(request.view)) for (const person of state.volunteers || []) if (person.status === 'active') usedPeople.add(person.id);
  const people = [...usedPeople].filter(id => !selectedPeople || selectedPeople.has(id)).map(id => ({ id, name: peopleById.get(id)?.name || id }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  if (people.length > VIEW_LIMITS.people) error(413, 'This view contains more than 250 people. Choose a smaller volunteer selection.');
  const range = { dateFrom, dateTo, timeFrom: graphical ? request.timeFrom : '00:00', timeTo: graphical ? request.timeTo : '24:00', startMinute, endMinute, slotMinutes: request.slotMinutes };
  const warnings = [], timelines = [], weekly = [];
  let clippedCount = 0, hiddenCount = 0, barCount = 0;
  const barsByDay = new Map(days.map(day => [day, []]));
  if (!selectedEvent) for (const day of days) for (const item of items) {
    if (item.date > day || item.endDate < day) continue;
    const from = day === item.date ? minute(item.start) : 0, to = day === item.endDate ? minute(item.end) : 1440;
    if (to <= from) continue;
    const visibleFrom = Math.max(from, startMinute), visibleTo = Math.min(to, endMinute);
    if (visibleFrom >= visibleTo) { hiddenCount++; continue; }
    if (from < startMinute || to > endMinute) clippedCount++;
    barsByDay.get(day).push({ key: `${item.key}-${day}`, itemKey: item.key, title: item.title, kind: item.kind, status: item.status, date: day,
      start: day === item.date ? item.start : '00:00', end: day === item.endDate ? item.end : '24:00', startMinute: visibleFrom, endMinute: visibleTo,
      clippedStart: from < startMinute || day > item.date, clippedEnd: to > endMinute || day < item.endDate,
      locationId: item.locationId, location: item.location, people: item.people.map(person => person.name), conflict: item.conflict, openPlaces: item.openPlaces });
  }
  const itemByKey = mapById(items.map(item => ({ ...item, id: item.key })));
  const addBars = bars => { barCount += bars.length; if (barCount > VIEW_LIMITS.bars) error(413, 'This view is too dense to print readably. Narrow the dates or volunteer selection.'); };
  const personBars = (bars, id) => bars.filter(bar => itemByKey.get(bar.itemKey).people.some(person => person.id === id));
  if (request.view.endsWith('timeline')) for (const day of days) {
    const bars = barsByDay.get(day), rows = [];
    if (request.view === 'volunteer-timeline') {
      for (const person of people) {
        const assigned = personBars(bars, person.id);
        if (!assigned.length && !request.includeIdle) continue;
        addBars(assigned); rows.push({ id: person.id, label: person.name, detail: `${occupiedHours(assigned)} h occupied`, lanes: lanesFor(assigned), hours: occupiedHours(assigned) });
      }
      const unfilled = bars.filter(bar => itemByKey.get(bar.itemKey).people.length === 0 || bar.openPlaces > 0);
      if (unfilled.length) { addBars(unfilled); rows.push({ id: '_open', label: 'Open places / no participants', detail: 'Review staffing in the register', lanes: lanesFor(unfilled), hours: 0 }); }
    } else {
      const stationIds = new Set(bars.map(bar => bar.locationId));
      if (request.includeIdle) for (const location of state.locations || []) if (!selectedLocations || selectedLocations.has(location.id)) stationIds.add(location.id);
      for (const id of stationIds) {
        const assigned = bars.filter(bar => bar.locationId === id); addBars(assigned);
        const location = locations.get(id), label = location?.name || assigned[0]?.location || id;
        rows.push({ id, label, detail: `${location?.floor ? `${location.floor} · ` : ''}${assigned.length} activities`, lanes: lanesFor(assigned), hours: occupiedHours(assigned) });
      }
      rows.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    }
    timelines.push({ date: day, rows });
  }
  if (request.view === 'weekly-roster') {
    for (const person of people) {
      const cells = days.map(day => { const bars = personBars(barsByDay.get(day), person.id); addBars(bars); return { date: day, hours: occupiedHours(bars), items: bars }; });
      weekly.push({ id: person.id, label: person.name, totalHours: round(cells.reduce((sum, cell) => sum + cell.hours, 0)), cells });
    }
    const cells = days.map(day => ({ date: day, hours: 0, items: barsByDay.get(day).filter(bar => !itemByKey.get(bar.itemKey).people.length || bar.openPlaces > 0) }));
    if (cells.some(cell => cell.items.length)) { cells.forEach(cell => addBars(cell.items)); weekly.push({ id: '_open', label: 'Open places / no participants', totalHours: 0, cells }); }
  }
  if (graphical && (clippedCount || hiddenCount)) warnings.push(`${clippedCount} daily activity segments cross the time-window boundary; ${hiddenCount} fall outside it. The activity register retains their complete dates and exact times.`);
  const conflictCount = items.filter(item => item.conflict).length;
  if (conflictCount) warnings.push(`${conflictCount} activities overlap for a shared volunteer within the selected export. Review the referenced conflicts.`);
  if (items.some(item => item.status === 'cancelled')) warnings.push('Cancelled activities are shown for reference; they contribute no occupied hours or open places.');
  if (scheduled.some(event => event.date !== event.endDate)) warnings.push('Multi-day events are continuous from their start date/time to their end date/time; they are not daily recurring sessions.');
  if (!items.length) warnings.push('No saved activities match this scope. Empty headings are retained.');
  const tables = [];
  const table = (title, columns, rows, note) => tables.push({ title, columns, rows, ...(note ? { note } : {}) });
  if (!selectedEvent) {
    table('Activity register', ['Ref', 'Activity', 'Date / time (JST)', 'Location', 'Status', 'Staffing'], items.map(item => [item.key, item.title,
      `${item.date} ${item.start} – ${item.endDate} ${item.end}`, item.location, pretty(item.status), item.kind === 'shift' ? `${item.people.length} / ${item.requiredCount}; ${item.openPlaces} open` : `${item.people.length} participants`]),
    'References identify bars and roster entries. Dates and exact times are authoritative; timeline spreadsheet cells use the selected time-band resolution.');
    table('Participants and follow-up', ['Ref', 'Participants', 'Conflicts / follow-up'], items.map(item => [item.key, item.people.map(person => person.name).join('\n') || 'No participants assigned',
      [item.conflictWith.length ? `Overlap: ${item.conflictWith.join(', ')}` : '', item.openPlaces ? `${item.openPlaces} open places` : ''].filter(Boolean).join('\n') || '—']));
    if (request.includeNotes) table('Coordination notes', ['Ref', 'Activity', 'Notes'], items.filter(item => item.notes).map(item => [item.key, item.title, item.notes]));
  }
  let event;
  if (selectedEvent) {
    const value = selectedEvent, type = (state.eventTypes || []).find(type => type.id === value.typeId), project = (state.projects || []).find(project => project.id === value.projectId);
    event = { title: value.title, description: value.description || '', metadata: [
      { label: 'Type', value: type?.name || 'Event' }, { label: 'Status', value: pretty(value.status) },
      { label: 'Date / time (JST)', value: `${value.date} ${value.start} – ${value.endDate} ${value.end}` },
      { label: 'Location', value: items[0].location }, { label: 'Coordinator', value: value.owner || 'To be confirmed' },
      { label: 'Project', value: project?.title || 'No linked project' }, { label: 'Record', value: `${value.id} · version ${value.version}` },
    ] };
    if (value.modules.includes('meeting')) table('Meeting preparation', ['Item', 'Details'], [
      ['Platform', pretty(value.meeting.provider)], ['Agenda', value.meeting.agenda || 'No agenda recorded'], ['Access', 'Open the event workspace for meeting access. Meeting URLs, IDs and passcodes are excluded.'],
    ]);
    const attendance = new Map(value.attendance.map(entry => [entry.volunteerId, entry]));
    table('Participant register', ['Volunteer', 'Attendance', 'Sign-in / initials', ...(request.includeNotes ? ['Notes'] : [])], items[0].people.map(person => [person.name, pretty(attendance.get(person.id)?.status || 'invited'), '', ...(request.includeNotes ? [attendance.get(person.id)?.notes || ''] : [])]), 'Names only. Contact details and administrative health records are excluded.');
    if (value.modules.includes('checklist')) table('Preparation checklist', ['Task', 'Owner', 'Due date', 'Status'], value.checklist.map(task => [task.title, task.owner || 'Unassigned', task.dueDate || '—', task.done ? 'Complete' : 'Open']));
    table('Linked service shifts', ['Activity', 'Date / time (JST)', 'Station', 'Staffing'], value.shiftIds.map(id => (state.shifts || []).find(shift => shift.id === id)).filter(Boolean).map(shift => [shift.title, `${shift.date} ${shift.start}–${shift.end}`, locations.get(shift.locationId)?.name || shift.locationId, `${shift.volunteerIds.length} / ${shift.requiredCount}`]));
    table('Resources', ['Resource', 'Station', 'Status', 'Available / total'], value.resourceIds.map(id => (state.resources || []).find(resource => resource.id === id)).filter(Boolean).map(resource => [resource.name, locations.get(resource.locationId)?.name || resource.locationId, pretty(resource.status), `${resource.available} / ${resource.quantity}`]));
    const jstTimestamp = timestamp => timestamp ? `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp))} JST` : '';
    table('Documents and reports', ['Document', 'Type', 'Updated (JST)'], (state.attachments || []).filter(file => file.targetType === 'events' && file.targetId === value.id).map(file => [file.name, file.kind === 'link' ? 'External reference' : file.contentType, jstTimestamp(file.updatedAt || file.createdAt)]), 'File contents and access URLs are not embedded. Open the event workspace to access authorized documents.');
    const records = (state.records || []).filter(record => record.eventId === value.id);
    if (records.length) table('Recorded activity', ['Volunteer', 'Date', 'Hours', 'Service interactions', ...(request.includeNotes ? ['Notes'] : [])], records.map(record => [peopleById.get(record.volunteerId)?.name || record.volunteerId, record.date, record.hours, record.serviceCount, ...(request.includeNotes ? [record.notes] : [])]));
    if (request.includeCustomFields) {
      const fields = mapById((state.fieldDefinitions || []).filter(field => field.scope === 'events'));
      table('Additional event fields', ['Field', 'Value'], Object.entries(value.customFields || {}).map(([id, content]) => [fields.get(id)?.label || id, content]), 'Explicitly included by the exporter; archived values are retained.');
    }
  } else if (request.includeCustomFields && scheduled.length) {
    const fields = mapById((state.fieldDefinitions || []).filter(field => field.scope === 'events'));
    table('Additional event fields', ['Ref', 'Field', 'Value'], scheduled.flatMap(value => Object.entries(value.customFields || {}).map(([id, content]) => [items.find(item => item.id === value.id && item.kind === 'event').key, fields.get(id)?.label || id, content])));
  }
  const title = { 'volunteer-timeline': 'Volunteer timetable', 'station-timeline': 'Station coverage board', 'weekly-roster': 'Weekly volunteer roster', 'event-brief': 'Event briefing sheet', 'event-agenda': 'Event agenda' }[request.view];
  const report = {
    schemaVersion: 1, view: request.view, title, subtitle: selectedEvent ? selectedEvent.title : `${dateFrom}${dateTo === dateFrom ? '' : ` — ${dateTo}`}${graphical ? ` · ${request.timeFrom}–${request.timeTo}` : ''} JST`,
    generatedAt: now.toISOString(), timezone: 'Asia/Tokyo', mode: options.mode || 'workspace', paper: request.paper, range, request: { ...request, dateFrom, dateTo },
    privacy: 'Names only; contact details, health records, meeting access credentials and file contents are excluded.',
    summary: [{ label: 'Activities', value: String(items.length) }, { label: 'People', value: String(people.length) }, { label: 'Open shift places', value: String(items.reduce((sum, item) => sum + item.openPlaces, 0)) }, { label: 'Overlap flags', value: String(conflictCount) }],
    legend: [{ label: 'Service shift', color: '#176B91' }, { label: 'Event', color: '#76569A' }, { label: 'Open places', color: '#946000' }, { label: 'Overlap', color: '#AD3E49' }, { label: 'Cancelled', color: '#667683' }],
    warnings, days, people, items, timelines, weekly, ...(event ? { event } : {}), tables,
  };
  if (graphical) report.warnings.push('Occupied hours count the union of non-cancelled activity intervals within the shown window, not actual service hours. Overlap flags exclude explicitly linked shift/event pairs and do not replace eligibility or transfer-time checks.');
  else if (!selectedEvent) report.warnings.push('Overlap flags compare the selected events only; service-shift eligibility and transfer-time checks remain in the scheduling workspace.');
  if (JSON.stringify(report).length > VIEW_LIMITS.textCharacters) error(413, 'This view contains too much detail. Narrow its scope or omit optional notes and fields.');
  return report;
}
