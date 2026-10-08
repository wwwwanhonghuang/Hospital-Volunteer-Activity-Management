// SPDX-License-Identifier: AGPL-3.0-only
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const minutes = value => Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]);
export const shiftHours = shift => (minutes(shift.end) - minutes(shift.start)) / 60;
export function weekStart(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}
export function weeklyHours(volunteerId, date, shifts, records = [], excludeShiftId = '') {
  const week = weekStart(date);
  const active = shifts.filter(shift => shift.id !== excludeShiftId && shift.status !== 'cancelled' && shift.volunteerIds.includes(volunteerId) && weekStart(shift.date) === week);
  const actual = records.filter(record => record.volunteerId === volunteerId && record.shiftId !== excludeShiftId && weekStart(record.date) === week);
  // Completed shifts with a record count actual hours once, instead of planned + actual.
  const recordedIds = new Set(actual.map(record => record.shiftId));
  return active.filter(shift => !recordedIds.has(shift.id)).reduce((sum, shift) => sum + shiftHours(shift), 0) + actual.reduce((sum, record) => sum + record.hours, 0);
}
export function eligibility(volunteer, shift, allShifts = [], records = []) {
  const reasons = [];
  if (!volunteer) return { eligible: false, reasons: ['Volunteer was not found.'], weeklyHours: 0 };
  if (volunteer.status !== 'active') reasons.push('Volunteer is not active.');
  if (volunteer.trainingStatus !== 'complete') reasons.push('Training is incomplete.');
  if (volunteer.healthStatus !== 'cleared') reasons.push('Administrative health clearance is pending.');
  if (!volunteer.healthDueDate || volunteer.healthDueDate < shift.date) reasons.push('Health clearance expires before this shift.');
  const weekday = weekdays[new Date(`${shift.date}T12:00:00Z`).getUTCDay()];
  if (!volunteer.availability.some(day => day.toLowerCase() === weekday.toLowerCase() || day.toLowerCase() === weekday.slice(0, 3).toLowerCase())) reasons.push(`Unavailable on ${weekday}.`);
  if (minutes(shift.start) < minutes(volunteer.availableFrom) || minutes(shift.end) > minutes(volunteer.availableTo)) reasons.push('Shift is outside available hours.');
  const missing = shift.requiredSkills.filter(skill => !volunteer.skills.includes(skill));
  if (missing.length) reasons.push(`Missing skills: ${missing.join(', ')}.`);
  for (const other of allShifts) {
    if (other.id === shift.id || other.status === 'cancelled' || other.date !== shift.date || !other.volunteerIds.includes(volunteer.id)) continue;
    const buffer = other.locationId === shift.locationId ? 0 : 10;
    if (minutes(shift.start) < minutes(other.end) + buffer && minutes(shift.end) + buffer > minutes(other.start)) reasons.push(`Conflicts with ${other.title}${buffer ? ' (10-minute transfer buffer)' : ''}.`);
  }
  const hours = weeklyHours(volunteer.id, shift.date, allShifts, records, shift.id);
  if (hours + shiftHours(shift) > volunteer.maxHoursPerWeek + 1e-9) reasons.push('Weekly hour limit would be exceeded.');
  return { eligible: reasons.length === 0, reasons, weeklyHours: hours };
}
/** Conservative greedy allocator: preserve existing assignments, fill scarcest shifts first. */
export function suggestSchedule(state, date) {
  const shifts = state.shifts.map(shift => ({ ...shift, volunteerIds: [...shift.volunteerIds] }));
  const targets = shifts.filter(shift => shift.date === date && !['completed', 'cancelled'].includes(shift.status));
  const explanations = ['Suggestions preserve existing assignments and require coordinator review. Eligibility includes training, clearance, availability, skills, weekly hours and a 10-minute transfer buffer.'];
  const availableCount = shift => state.volunteers.filter(volunteer => eligibility(volunteer, shift, shifts, state.records).eligible).length;
  targets.sort((a, b) => availableCount(a) - availableCount(b) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  for (const shift of targets) {
    for (const id of shift.volunteerIds) {
      const volunteer = state.volunteers.find(person => person.id === id);
      const check = eligibility(volunteer, shift, shifts, state.records);
      if (!check.eligible) explanations.push(`${shift.title}: review existing assignment ${volunteer?.name || id}: ${check.reasons.join(' ')}`);
    }
    while (shift.volunteerIds.length < shift.requiredCount) {
      const candidates = state.volunteers.filter(volunteer => !shift.volunteerIds.includes(volunteer.id))
        .map(volunteer => ({ volunteer, check: eligibility(volunteer, shift, shifts, state.records) }))
        .filter(item => item.check.eligible)
        .sort((a, b) => a.check.weeklyHours / a.volunteer.maxHoursPerWeek - b.check.weeklyHours / b.volunteer.maxHoursPerWeek || a.check.weeklyHours - b.check.weeklyHours || a.volunteer.name.localeCompare(b.volunteer.name));
      if (!candidates.length) break;
      shift.volunteerIds.push(candidates[0].volunteer.id);
      explanations.push(`${candidates[0].volunteer.name} → ${shift.title}: eligible; ${candidates[0].check.weeklyHours.toFixed(1)} hours already allocated this week.`);
    }
  }
  const changes = targets.filter(shift => JSON.stringify(shift.volunteerIds) !== JSON.stringify(state.shifts.find(original => original.id === shift.id).volunteerIds)).map(shift => ({ id: shift.id, version: shift.version, volunteerIds: shift.volunteerIds }));
  const unfilled = targets.filter(shift => shift.volunteerIds.length < shift.requiredCount).map(shift => ({ shiftId: shift.id, missing: shift.requiredCount - shift.volunteerIds.length }));
  if (unfilled.length) explanations.push('Some positions remain open because no eligible volunteer is available. Recruit cover or adjust shift requirements.');
  return { changes, unfilled, explanations };
}
