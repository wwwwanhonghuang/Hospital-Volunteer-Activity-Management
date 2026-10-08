import type { Volunteer, Shift, ActivityRecord, AppState } from '../src/types';
export function minutes(value: string): number;
export function shiftHours(shift: Shift): number;
export function weekStart(date: string): string;
export function weeklyHours(volunteerId: string, date: string, shifts: Shift[], records?: ActivityRecord[], excludeShiftId?: string): number;
export function eligibility(volunteer: Volunteer | undefined, shift: Shift, allShifts?: Shift[], records?: ActivityRecord[]): { eligible: boolean; reasons: string[]; weeklyHours: number };
export function suggestSchedule(state: AppState, date: string): { changes: { id: string; version: number; volunteerIds: string[] }[]; unfilled: { shiftId: string; missing: number }[]; explanations: string[] };
