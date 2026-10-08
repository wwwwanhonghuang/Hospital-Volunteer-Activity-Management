// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

export const SPATIAL_FLOORS = Object.freeze(['B3', 'B1', '1F', '2F', '3F', '4F', '6F', '7F']);
export const SPATIAL_ASSET_KINDS = Object.freeze(['chair', 'desk', 'counter', 'bookshelf', 'wheelchair', 'bed', 'cart', 'kiosk', 'sign', 'planter', 'scanner', 'rehab-bars', 'bench', 'privacy-screen', 'table']);
export const SCENARIO_LIMITS = Object.freeze({ objects: 2000, additions: 300, routes: 100, routePoints: 50, x: 45, z: 22, y: 6 });
const reservedIds = new Set(['__proto__', 'prototype', 'constructor']);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value) && !reservedIds.has(value);
const id = z.string().refine(validId, 'Use a safe identifier of at most 160 letters, numbers, dots, colons, underscores or hyphens.');
const x = z.number().finite().min(-SCENARIO_LIMITS.x).max(SCENARIO_LIMITS.x);
const y = z.number().finite().min(0).max(SCENARIO_LIMITS.y);
const zPosition = z.number().finite().min(-SCENARIO_LIMITS.z).max(SCENARIO_LIMITS.z);
const rotation = z.number().finite().min(-2 * Math.PI).max(2 * Math.PI);
const name = z.string().trim().min(1).max(160);
const floor = z.enum(SPATIAL_FLOORS);
const transform = z.object({ x, y, z: zPosition, rotation, hidden: z.boolean() }).strict();
// Check raw keys before Zod constructs its parsed object: unsafe prototype keys
// must be rejected, never silently removed or copied into another object.
const overrides = z.unknown().superRefine((value, context) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Object overrides must be an object.' });
    return;
  }
  if (Object.keys(value).length > SCENARIO_LIMITS.objects) context.addIssue({ code: z.ZodIssueCode.custom, message: `Use at most ${SCENARIO_LIMITS.objects} object overrides.` });
  for (const key of Object.keys(value)) if (!validId(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Object identifier is invalid or reserved.' });
}).pipe(z.record(transform));
const addition = z.object({ id, kind: z.enum(SPATIAL_ASSET_KINDS), floor, x, y, z: zPosition, rotation, name }).strict();
const route = z.object({ id, volunteerId: id, shiftId: id, floor, points: z.array(z.object({ x, z: zPosition }).strict()).min(2).max(SCENARIO_LIMITS.routePoints) }).strict();

export const scenarioSchema = z.object({
  name,
  description: z.string().trim().max(4000).default(''),
  objects: overrides.default({}),
  additions: z.array(addition).max(SCENARIO_LIMITS.additions).default([]),
  routes: z.array(route).max(SCENARIO_LIMITS.routes).default([]),
});

/** Validate scenario content and, when supplied, references to operational data.
 * A rehearsal retains historical assignments and never changes the real roster.
 */
export function validateScenario(value, state) {
  const parsed = scenarioSchema.safeParse(value);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map(issue => `${issue.path.join('.') || 'Scenario'}: ${issue.message}`) };
  const scenario = parsed.data, errors = [], additionIds = new Set(), routeIds = new Set(), assignments = new Set();
  for (const object of scenario.additions) {
    if (additionIds.has(object.id)) errors.push(`Added object identifier ${object.id} occurs more than once.`);
    additionIds.add(object.id);
  }
  for (const route of scenario.routes) {
    if (routeIds.has(route.id)) errors.push(`Route identifier ${route.id} occurs more than once.`);
    routeIds.add(route.id);
    const assignment = `${route.shiftId}\u0000${route.volunteerId}`;
    if (assignments.has(assignment)) errors.push('Only one rehearsal route is allowed per volunteer and shift.');
    assignments.add(assignment);
    if (!route.points.some((point, index) => index > 0 && (point.x !== route.points[index - 1].x || point.z !== route.points[index - 1].z))) errors.push(`Route ${route.id} needs at least two different points.`);
    if (!state) continue;
    const volunteer = state.volunteers.find(person => person.id === route.volunteerId);
    const shift = state.shifts.find(item => item.id === route.shiftId);
    if (!volunteer) errors.push(`Route ${route.id}: volunteer was not found.`);
    if (!shift) { errors.push(`Route ${route.id}: shift was not found.`); continue; }
    if (!shift.volunteerIds.includes(route.volunteerId)) errors.push(`Route ${route.id}: volunteer must be assigned to the linked shift.`);
    const location = state.locations.find(item => item.id === shift.locationId);
    if (!location || location.floor !== route.floor) errors.push(`Route ${route.id}: route floor must match the shift location floor. Routes cannot cross floors.`);
  }
  return { valid: errors.length === 0, errors };
}
