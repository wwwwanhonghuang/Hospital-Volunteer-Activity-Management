// SPDX-License-Identifier: AGPL-3.0-only
import type { AppState } from '../src/types';
export type ExportView = 'volunteer-timeline' | 'station-timeline' | 'weekly-roster' | 'event-brief' | 'event-agenda';
export interface ViewExportRequest {
  view: ExportView;
  dateFrom?: string; dateTo?: string;
  timeFrom?: string; timeTo?: string; slotMinutes?: 15 | 30 | 60;
  paper?: 'A4' | 'A3';
  includeEvents?: boolean; includeIdle?: boolean; includeNotes?: boolean; includeCustomFields?: boolean;
  statuses?: ('draft' | 'confirmed' | 'active' | 'completed' | 'cancelled')[];
  eventId?: string; eventIds?: string[]; volunteerIds?: string[]; locationIds?: string[];
}
export interface ReportPerson { id: string; name: string }
export interface ReportItem {
  key: string; id: string; kind: 'shift' | 'event'; title: string;
  date: string; endDate: string; start: string; end: string; status: string;
  locationId: string; location: string; people: ReportPerson[]; notes: string;
  requiredCount: number | null; openPlaces: number;
  conflict: boolean; conflictWith: string[];
}
export interface ReportBar {
  key: string; itemKey: string; title: string; kind: 'shift' | 'event'; status: string;
  date: string; start: string; end: string; startMinute: number; endMinute: number;
  clippedStart: boolean; clippedEnd: boolean; locationId: string; location: string; people: string[];
  conflict: boolean; openPlaces: number;
}
export interface ReportTimelineRow {
  id: string; label: string; detail: string; lanes: ReportBar[][]; hours: number;
}
export interface ReportTable { title: string; columns: string[]; rows: (string | number | boolean | null)[][]; note?: string }
export interface ViewReport {
  schemaVersion: 1; view: ExportView; title: string; subtitle: string;
  generatedAt: string; timezone: 'Asia/Tokyo'; mode: string; paper: 'A4' | 'A3';
  range: {dateFrom: string; dateTo: string; timeFrom: string; timeTo: string; startMinute: number; endMinute: number; slotMinutes: number};
  request: ViewExportRequest;
  privacy: string; summary: {label: string; value: string}[];
  legend: {label: string; color: string}[]; warnings: string[];
  days: string[]; people: ReportPerson[]; items: ReportItem[];
  timelines: {date: string; rows: ReportTimelineRow[]}[];
  weekly: {id: string; label: string; totalHours: number; cells: {date: string; hours: number; items: ReportBar[]}[]}[];
  event?: {title: string; description: string; metadata: {label: string; value: string}[]};
  tables: ReportTable[];
}
export const VIEW_LIMITS: Readonly<{days: number; items: number; people: number; textCharacters: number}>;
export function parseViewRequest(value: unknown): ViewExportRequest;
export function buildViewReport(state: AppState, input: ViewExportRequest, options?: {now?: Date; mode?: string}): ViewReport;
