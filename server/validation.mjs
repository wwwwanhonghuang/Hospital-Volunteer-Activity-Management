// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { calculateCPM } from '../shared/cpm.mjs';
import { eligibility, shiftHours } from '../shared/scheduling.mjs';
import { tokyoDate } from './seed.mjs';
import { scenarioSchema, validateScenario } from '../shared/spatial-scenario.mjs';
export const collections = ['volunteers','projects','tasks','shifts','records','requests','resources','scenarios'];
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const string = z.string().trim().max(4000), label = z.string().trim().min(1).max(160), optionalText = string.default('');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid YYYY-MM-DD date.').refine(value => { const parsed = new Date(`${value}T12:00:00Z`); return !isNaN(parsed) && parsed.toISOString().slice(0,10) === value; }, 'Date does not exist.');
export const dateSchema = date;
const optionalDate = z.union([date,z.literal('')]).default('');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a valid HH:mm time.');
const list = z.array(label).max(100).refine(values => new Set(values).size === values.length, 'Duplicate list entries are not allowed.');
const money = z.number().finite().min(0).max(1e10);
const common = { id:z.string().max(100).optional(),version:z.number().int().positive().optional(),createdAt:z.string().optional(),updatedAt:z.string().optional() };
const schemas = {
  scenarios:scenarioSchema.extend(common),
  volunteers:z.object({ ...common,name:label,kana:optionalText,email:z.union([z.string().email().max(254),z.literal('')]).default(''),phone:z.string().max(50).default(''),status:z.enum(['applicant','onboarding','active','paused','archived']),skills:list.default([]),languages:list.default([]),trainingStatus:z.enum(['pending','complete']),healthStatus:z.enum(['pending','cleared','followup']),healthDueDate:optionalDate,availability:z.array(z.enum(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','Mon','Tue','Wed','Thu','Fri','Sat','Sun','mon','tue','wed','thu','fri','sat','sun'])).max(7).transform(values=>[...new Set(values.map(value=>value.slice(0,3).toLowerCase()))]),availableFrom:time,availableTo:time,maxHoursPerWeek:z.number().positive().max(60),joinedDate:date,notes:optionalText }).refine(value => value.availableFrom < value.availableTo, 'Available end time must follow the start.'),
  projects:z.object({ ...common,title:label,category:label,description:optionalText,owner:optionalText,department:optionalText,status:z.enum(['draft','planning','approved','active','completed','cancelled']),startDate:date,dueDate:date,budget:money,spent:money,goals:optionalText,risks:optionalText }).refine(value => value.dueDate >= value.startDate,'Project due date must follow its start.'),
  tasks:z.object({ ...common,projectId:label,title:label,duration:z.number().int().min(1).max(3650),dependencies:list.default([]),status:z.enum(['todo','doing','done']),assignee:optionalText,progress:z.number().int().min(0).max(100) }),
  shifts:z.object({ ...common,title:label,date,start:time,end:time,locationId:label,requiredSkills:list.default([]),requiredCount:z.number().int().min(1).max(50),volunteerIds:list.default([]),status:z.enum(['draft','confirmed','active','completed','cancelled']),projectId:z.string().max(100).default(''),notes:optionalText }).refine(value => value.start < value.end,'Shift end must follow its start on the same day.').refine(value => value.volunteerIds.length <= value.requiredCount,'Assignments exceed the required headcount.'),
  records:z.object({ ...common,volunteerId:label,shiftId:label,date,hours:z.number().positive().max(24),serviceCount:z.number().int().min(0).max(100000),category:label,notes:optionalText }),
  requests:z.object({ ...common,title:label,category:z.enum(['consultation','improvement','incident','coordination']),priority:z.enum(['low','normal','high']),status:z.enum(['open','in_progress','resolved']),owner:optionalText,department:optionalText,dueDate:optionalDate,description:optionalText,resolution:optionalText }).refine(value=>value.status!=='resolved'||value.resolution.length>0,'Add a resolution before closing this request.'),
  resources:z.object({ ...common,name:label,category:label,locationId:label,quantity:z.number().int().min(0).max(100000),available:z.number().int().min(0).max(100000),inspectedDate:optionalDate,status:z.enum(['ready','maintenance']),notes:optionalText }).refine(value => value.available <= value.quantity,'Available quantity cannot exceed total quantity.'),
};
export function parseEntity(collection, value) {
  const result = schemas[collection].safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues.map(issue => `${issue.path.join('.') || 'Record'}: ${issue.message}`).join(' '));
  return result.data;
}
function mustFind(values,id,label) { const found=values.find(value=>value.id===id); if (!found) throw new HttpError(400,`${label} was not found.`); return found; }
export function validateStateChange(state,collection,entity,{checkEligibility=true}={}) {
  if (collection === 'tasks') {
    mustFind(state.projects,entity.projectId,'Project');
    try { calculateCPM(state.tasks); } catch(error) { throw new HttpError(400,error.message); }
  }
  if (collection === 'shifts') {
    if(entity.status==='completed'&&entity.date>tokyoDate())throw new HttpError(400,'A future shift cannot be marked completed.');
    mustFind(state.locations,entity.locationId,'Location');
    if (entity.projectId) mustFind(state.projects,entity.projectId,'Project');
    for (const id of entity.volunteerIds) {
      const volunteer=mustFind(state.volunteers,id,'Volunteer');
      if (checkEligibility && !['cancelled','completed'].includes(entity.status)) {
        const check=eligibility(volunteer,entity,state.shifts,state.records);
        if (!check.eligible) throw new HttpError(400,`${volunteer.name}: ${check.reasons.join(' ')}`);
      }
    }
    for (const record of state.records.filter(record=>record.shiftId===entity.id)) {
      if (!entity.volunteerIds.includes(record.volunteerId) || record.date!==entity.date || entity.status==='cancelled') throw new HttpError(409,'Existing activity records must remain linked to their assigned volunteer and shift date.');
      if(record.hours>shiftHours(entity))throw new HttpError(409,'The shift duration cannot be shorter than its recorded activity hours.');
    }
    const location=state.locations.find(value=>value.id===entity.locationId);
    for (const scenario of state.scenarios || []) {
      if (scenario.routes.some(route=>route.shiftId===entity.id && (!entity.volunteerIds.includes(route.volunteerId) || route.floor!==location.floor))) throw new HttpError(409,`Update or remove the rehearsal routes in scenario "${scenario.name}" before changing this assignment or its floor.`);
    }
  }
  if (collection === 'records') {
    if(entity.date>tokyoDate())throw new HttpError(400,'Activity records cannot be dated in the future.');
    mustFind(state.volunteers,entity.volunteerId,'Volunteer');
    const shift=mustFind(state.shifts,entity.shiftId,'Shift');
    if (!shift.volunteerIds.includes(entity.volunteerId)) throw new HttpError(400,'Activity records require a volunteer assigned to the shift.');
    if (shift.status==='cancelled') throw new HttpError(400,'Cancelled shifts cannot receive activity records.');
    if (entity.date!==shift.date) throw new HttpError(400,'Activity date must match the shift date.');
    if (entity.hours>shiftHours(shift)) throw new HttpError(400,'Activity hours cannot exceed the shift duration.');
    if (state.records.some(record=>record.id!==entity.id && record.shiftId===entity.shiftId && record.volunteerId===entity.volunteerId)) throw new HttpError(409,'An activity record already exists for this volunteer and shift.');
  }
  if (collection === 'resources') mustFind(state.locations,entity.locationId,'Location');
  if (collection === 'scenarios') {
    const result=validateScenario(entity,state);
    if (!result.valid) throw new HttpError(400,result.errors.join(' '));
  }
}
export function validateDelete(state,collection,id) {
  const linkedScenario=(state.scenarios || []).find(scenario=>scenario.routes.some(route=>(collection==='shifts'&&route.shiftId===id)||(collection==='volunteers'&&route.volunteerId===id)));
  if (linkedScenario) throw new HttpError(409,`Remove the rehearsal routes in scenario "${linkedScenario.name}" before deleting this record.`);
  let inUse=false;
  if (collection==='volunteers') inUse=state.shifts.some(shift=>shift.volunteerIds.includes(id))||state.records.some(record=>record.volunteerId===id);
  if (collection==='projects') inUse=state.tasks.some(task=>task.projectId===id)||state.shifts.some(shift=>shift.projectId===id);
  if (collection==='tasks') inUse=state.tasks.some(task=>task.dependencies.includes(id));
  if (collection==='shifts') inUse=state.records.some(record=>record.shiftId===id);
  if (inUse) throw new HttpError(409,'This record is referenced by other records. Update those references or archive it first.');
}
