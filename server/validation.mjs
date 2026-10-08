// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { calculateCPM } from '../shared/cpm.mjs';
import { eligibility, shiftHours } from '../shared/scheduling.mjs';
import { tokyoDate } from './seed.mjs';
import { scenarioSchema, validateScenario } from '../shared/spatial-scenario.mjs';
export const collections = ['volunteers','projects','tasks','shifts','records','requests','resources','scenarios','eventTypes','events','fieldDefinitions','entries','attachments'];
export const managedCollections = collections.filter(value=>value!=='attachments');
export const MAX_FIELDS_PER_SCOPE=100;
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const string = z.string().trim().max(4000), label = z.string().trim().min(1).max(160), optionalText = string.default('');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid YYYY-MM-DD date.').refine(value => { const parsed = new Date(`${value}T12:00:00Z`); return !isNaN(parsed) && parsed.toISOString().slice(0,10) === value; }, 'Date does not exist.');
export const dateSchema = date;
const optionalDate = z.union([date,z.literal('')]).default('');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a valid HH:mm time.');
const list = z.array(label).max(100).refine(values => new Set(values).size === values.length, 'Duplicate list entries are not allowed.');
const money = z.number().finite().min(0).max(1e10);
const common = { id:z.string().max(100).optional(),version:z.number().int().positive().optional(),createdAt:z.string().optional(),updatedAt:z.string().optional() };
const customFields = z.record(z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),z.union([z.string().max(4000),z.number().finite(),z.boolean(),z.null()])).default({}).refine(value=>Object.keys(value).length<=MAX_FIELDS_PER_SCOPE,'Use at most 100 custom fields.');
export const safeHttpsUrl = z.string().max(2000).refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!/[\u0000-\u0020\u007f]/.test(value)&&!/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value);}catch{return false;}},'Use a complete HTTPS URL without credentials or control characters.');
const modules=z.array(z.enum(['meeting','checklist','attendance'])).max(3).refine(value=>new Set(value).size===value.length,'Duplicate modules are not allowed.');
const uniqueIds = values => new Set(values.map(value=>value.id)).size===values.length;
export const attachmentTargets=['events','volunteers','shifts','records','entries'];
export const attachmentSchema=z.object({...common,targetType:z.enum(attachmentTargets),targetId:label,name:label,kind:z.enum(['file','link']),url:z.union([safeHttpsUrl,z.literal('')]).default(''),contentType:z.string().max(150).default(''),size:z.number().int().min(0).max(10*1024*1024).default(0),sha256:z.union([z.string().regex(/^[a-f0-9]{64}$/),z.literal('')]).default(''),uploadedBy:label,description:optionalText});
const schemas = {
  attachments:attachmentSchema,
  eventTypes:z.object({...common,name:label,description:optionalText,color:z.enum(['blue','green','amber','purple']).default('blue'),defaultModules:modules.default([]),active:z.boolean().default(true)}),
  fieldDefinitions:z.object({...common,scope:z.enum(['volunteers','events','records','entries']),label,type:z.enum(['text','textarea','number','date','select','boolean']),options:list.default([]),required:z.boolean().default(false),active:z.boolean().default(true),order:z.number().int().min(0).max(10000).default(0)}).refine(value=>value.type!=='select'||value.options.length>0,'Select fields require at least one option.').refine(value=>value.type==='select'||value.options.length===0,'Only select fields can have options.'),
  entries:z.object({...common,volunteerId:label,eventId:z.string().max(100).default(''),title:label,category:label,status:z.enum(['open','complete']),date,dueDate:optionalDate,body:optionalText,customFields}),
  events:z.object({...common,title:label,typeId:label,date,endDate:date,start:time,end:time,status:z.enum(['draft','confirmed','active','completed','cancelled']),description:optionalText,owner:optionalText,locationId:z.string().max(100).default(''),locationText:optionalText,projectId:z.string().max(100).default(''),volunteerIds:list.default([]),shiftIds:list.default([]),resourceIds:list.default([]),modules:modules.default([]),meeting:z.object({provider:z.enum(['zoom','google-meet','teams','other']).default('other'),url:z.union([safeHttpsUrl,z.literal('')]).default(''),meetingId:z.string().max(160).default(''),passcode:z.string().max(160).default(''),agenda:optionalText}).default({}),checklist:z.array(z.object({id:label,title:label,done:z.boolean(),owner:optionalText,dueDate:optionalDate})).max(100).refine(uniqueIds,'Checklist item identifiers must be unique.').default([]),attendance:z.array(z.object({volunteerId:label,status:z.enum(['invited','confirmed','attended','absent']),notes:optionalText})).max(100).refine(values=>new Set(values.map(value=>value.volunteerId)).size===values.length,'Each attendee may occur only once.').default([]),customFields}).refine(value=>`${value.endDate}T${value.end}`>`${value.date}T${value.start}`,'Event end must follow its start.'),
  scenarios:scenarioSchema.extend(common),
  volunteers:z.object({ ...common,name:label,kana:optionalText,email:z.union([z.string().email().max(254),z.literal('')]).default(''),phone:z.string().max(50).default(''),status:z.enum(['applicant','onboarding','active','paused','archived']),skills:list.default([]),languages:list.default([]),trainingStatus:z.enum(['pending','complete']),healthStatus:z.enum(['pending','cleared','followup']),healthDueDate:optionalDate,availability:z.array(z.enum(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','Mon','Tue','Wed','Thu','Fri','Sat','Sun','mon','tue','wed','thu','fri','sat','sun'])).max(7).transform(values=>[...new Set(values.map(value=>value.slice(0,3).toLowerCase()))]),availableFrom:time,availableTo:time,maxHoursPerWeek:z.number().positive().max(60),joinedDate:date,notes:optionalText,contactPreference:z.enum(['email','phone','either']).default('either'),emergencyContact:z.object({name:optionalText,relationship:optionalText,phone:z.string().max(50).default('')}).default({}),address:optionalText,tags:list.default([]),customFields }).refine(value => value.availableFrom < value.availableTo, 'Available end time must follow the start.'),
  projects:z.object({ ...common,title:label,category:label,description:optionalText,owner:optionalText,department:optionalText,status:z.enum(['draft','planning','approved','active','completed','cancelled']),startDate:date,dueDate:date,budget:money,spent:money,goals:optionalText,risks:optionalText }).refine(value => value.dueDate >= value.startDate,'Project due date must follow its start.'),
  tasks:z.object({ ...common,projectId:label,title:label,duration:z.number().int().min(1).max(3650),dependencies:list.default([]),status:z.enum(['todo','doing','done']),assignee:optionalText,progress:z.number().int().min(0).max(100) }),
  shifts:z.object({ ...common,title:label,date,start:time,end:time,locationId:label,requiredSkills:list.default([]),requiredCount:z.number().int().min(1).max(50),volunteerIds:list.default([]),status:z.enum(['draft','confirmed','active','completed','cancelled']),projectId:z.string().max(100).default(''),notes:optionalText }).refine(value => value.start < value.end,'Shift end must follow its start on the same day.').refine(value => value.volunteerIds.length <= value.requiredCount,'Assignments exceed the required headcount.'),
  records:z.object({ ...common,volunteerId:label,shiftId:label,date,hours:z.number().positive().max(24),serviceCount:z.number().int().min(0).max(100000),category:label,notes:optionalText,eventId:z.string().max(100).default(''),customFields }),
  requests:z.object({ ...common,title:label,category:z.enum(['consultation','improvement','incident','coordination']),priority:z.enum(['low','normal','high']),status:z.enum(['open','in_progress','resolved']),owner:optionalText,department:optionalText,dueDate:optionalDate,description:optionalText,resolution:optionalText }).refine(value=>value.status!=='resolved'||value.resolution.length>0,'Add a resolution before closing this request.'),
  resources:z.object({ ...common,name:label,category:label,locationId:label,quantity:z.number().int().min(0).max(100000),available:z.number().int().min(0).max(100000),inspectedDate:optionalDate,status:z.enum(['ready','maintenance']),notes:optionalText }).refine(value => value.available <= value.quantity,'Available quantity cannot exceed total quantity.'),
};
export function parseEntity(collection, value) {
  const result = schemas[collection].safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues.map(issue => `${issue.path.join('.') || 'Record'}: ${issue.message}`).join(' '));
  return result.data;
}
function mustFind(values,id,label) { const found=values.find(value=>value.id===id); if (!found) throw new HttpError(400,`${label} was not found.`); return found; }
export function validateStateChange(state,collection,entity,{checkEligibility=true,previous,checkRequired=true}={}) {
  if(['volunteers','events','records','entries'].includes(collection))validateCustomFields(state,collection,entity,{checkRequired});
  if(collection==='eventTypes'&&state.eventTypes.some(value=>value.id!==entity.id&&value.name.toLowerCase()===entity.name.toLowerCase()))throw new HttpError(409,'An event type with this name already exists.');
  if(collection==='fieldDefinitions') {
    if(state.fieldDefinitions.filter(value=>value.scope===entity.scope).length>MAX_FIELDS_PER_SCOPE)throw new HttpError(409,'A record type can have at most 100 custom fields, including archived fields. Remove unused fields before adding another.');
    if(state.fieldDefinitions.some(value=>value.id!==entity.id&&value.scope===entity.scope&&value.label.toLowerCase()===entity.label.toLowerCase()))throw new HttpError(409,'A field with this label already exists in this record type.');
    if(previous){const used=(state[previous.scope]||[]).filter(value=>Object.hasOwn(value.customFields||{},entity.id));if(used.length){if(previous.scope!==entity.scope||previous.type!==entity.type)throw new HttpError(409,'This field contains saved values. Archive it and create a new field to change its scope or type.');if(entity.type==='select'&&used.some(value=>value.customFields[entity.id]!==null&&value.customFields[entity.id]!==''&&!entity.options.includes(value.customFields[entity.id])))throw new HttpError(409,'A removed option is used by existing records. Retain the option or update those records first.');}}
  }
  if(collection==='events') {
    const type=mustFind(state.eventTypes,entity.typeId,'Event type');
    if(!type.active&&previous?.typeId!==type.id&&checkRequired)throw new HttpError(400,'Choose an active event type.');
    if(entity.locationId)mustFind(state.locations,entity.locationId,'Location');
    if(entity.projectId)mustFind(state.projects,entity.projectId,'Project');
    for(const id of entity.volunteerIds)mustFind(state.volunteers,id,'Volunteer');
    for(const id of entity.shiftIds)mustFind(state.shifts,id,'Shift');
    for(const id of entity.resourceIds)mustFind(state.resources,id,'Resource');
    for(const attendee of entity.attendance){mustFind(state.volunteers,attendee.volunteerId,'Attendee');if(!entity.volunteerIds.includes(attendee.volunteerId))throw new HttpError(400,'Add each attendee to the event volunteer list first.');}
  }
  if(collection==='entries') {mustFind(state.volunteers,entity.volunteerId,'Volunteer');if(entity.eventId)mustFind(state.events,entity.eventId,'Event');}
  if(collection==='attachments')mustFind(state[entity.targetType],entity.targetId,'Attachment target');
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
    if(entity.eventId)mustFind(state.events,entity.eventId,'Event');
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
  if((state.attachments||[]).some(value=>value.targetType===collection&&value.targetId===id))throw new HttpError(409,'Remove attached files and links before deleting this record.');
  const linkedScenario=(state.scenarios || []).find(scenario=>scenario.routes.some(route=>(collection==='shifts'&&route.shiftId===id)||(collection==='volunteers'&&route.volunteerId===id)));
  if (linkedScenario) throw new HttpError(409,`Remove the rehearsal routes in scenario "${linkedScenario.name}" before deleting this record.`);
  let inUse=false;
  if (collection==='volunteers') inUse=state.shifts.some(shift=>shift.volunteerIds.includes(id))||state.records.some(record=>record.volunteerId===id)||(state.entries||[]).some(value=>value.volunteerId===id)||(state.events||[]).some(value=>value.volunteerIds.includes(id)||value.attendance.some(person=>person.volunteerId===id));
  if (collection==='projects') inUse=state.tasks.some(task=>task.projectId===id)||state.shifts.some(shift=>shift.projectId===id)||(state.events||[]).some(value=>value.projectId===id);
  if (collection==='tasks') inUse=state.tasks.some(task=>task.dependencies.includes(id));
  if (collection==='shifts') inUse=state.records.some(record=>record.shiftId===id)||(state.events||[]).some(value=>value.shiftIds.includes(id));
  if (collection==='resources') inUse=(state.events||[]).some(value=>value.resourceIds.includes(id));
  if (collection==='eventTypes') inUse=(state.events||[]).some(value=>value.typeId===id);
  if (collection==='events') inUse=(state.entries||[]).some(value=>value.eventId===id)||state.records.some(value=>value.eventId===id);
  if (collection==='fieldDefinitions') inUse=['volunteers','events','records','entries'].some(scope=>(state[scope]||[]).some(value=>Object.hasOwn(value.customFields||{},id)));
  if (inUse) throw new HttpError(409,'This record is referenced by other records. Update those references or archive it first.');
}

function validateCustomFields(state,scope,entity,{checkRequired}) {
  const definitions=(state.fieldDefinitions||[]).filter(value=>value.scope===scope),values=entity.customFields||{};
  for(const id of Object.keys(values))if(!definitions.some(value=>value.id===id))throw new HttpError(400,'A custom field is missing or belongs to another record type.');
  for(const definition of definitions){const value=values[definition.id],empty=value===undefined||value===null||value==='';if(empty){if(checkRequired&&definition.active&&definition.required)throw new HttpError(400,`${definition.label} is required.`);continue;}
    let valid=true;
    if(['text','textarea'].includes(definition.type))valid=typeof value==='string';
    if(definition.type==='number')valid=typeof value==='number'&&Number.isFinite(value);
    if(definition.type==='boolean')valid=typeof value==='boolean';
    if(definition.type==='date')valid=typeof value==='string'&&date.safeParse(value).success;
    if(definition.type==='select')valid=typeof value==='string'&&definition.options.includes(value);
    if(!valid)throw new HttpError(400,`${definition.label} has an invalid ${definition.type} value.`);
  }
}
