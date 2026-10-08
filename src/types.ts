// SPDX-License-Identifier: AGPL-3.0-only
export type Role = 'admin' | 'coordinator' | 'viewer';
export type User = { id: string; name: string; username: string; role: Role };
export type Entity = { id: string; version: number; createdAt?: string; updatedAt?: string };
export type CustomValues = Record<string, string | number | boolean | null>;
export type FieldScope = 'volunteers' | 'events' | 'records' | 'entries';
export type FieldDefinition = Entity & { scope: FieldScope; label: string; type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'boolean'; options: string[]; required: boolean; active: boolean; order: number };
export type EventModule = 'meeting' | 'checklist' | 'attendance';
export type EventType = Entity & { name: string; description: string; color: 'blue' | 'green' | 'amber' | 'purple'; defaultModules: EventModule[]; active: boolean };
export type ScheduledEvent = Entity & {
  title: string; typeId: string; date: string; endDate: string; start: string; end: string;
  status: 'draft' | 'confirmed' | 'active' | 'completed' | 'cancelled'; description: string; owner: string;
  locationId: string; locationText: string; projectId: string; volunteerIds: string[]; shiftIds: string[]; resourceIds: string[];
  modules: EventModule[]; meeting: { provider: 'zoom' | 'google-meet' | 'teams' | 'other'; url: string; meetingId: string; passcode: string; agenda: string };
  checklist: { id: string; title: string; done: boolean; owner: string; dueDate: string }[];
  attendance: { volunteerId: string; status: 'invited' | 'confirmed' | 'attended' | 'absent'; notes: string }[];
  customFields: CustomValues;
};
export type ProfileEntry = Entity & { volunteerId: string; eventId: string; title: string; category: string; status: 'open' | 'complete'; date: string; dueDate: string; body: string; customFields: CustomValues };
export type AttachmentTarget = 'events' | 'volunteers' | 'shifts' | 'records' | 'entries';
export type Attachment = Entity & { targetType: AttachmentTarget; targetId: string; name: string; kind: 'file' | 'link'; url: string; contentType: string; size: number; sha256: string; uploadedBy: string; description: string };
export type Volunteer = Entity & {
  name: string; kana: string; email: string; phone: string;
  status: 'applicant' | 'onboarding' | 'active' | 'paused' | 'archived';
  skills: string[]; languages: string[];
  trainingStatus: 'pending' | 'complete'; healthStatus: 'pending' | 'cleared' | 'followup';
  healthDueDate: string; availability: string[]; availableFrom: string; availableTo: string;
  maxHoursPerWeek: number; joinedDate: string; notes: string;
  contactPreference?: 'email' | 'phone' | 'either'; address?: string; tags?: string[];
  emergencyContact?: { name: string; relationship: string; phone: string }; customFields?: CustomValues;
};
export type Project = Entity & {
  title: string; category: string; description: string; owner: string; department: string;
  status: 'draft' | 'planning' | 'approved' | 'active' | 'completed' | 'cancelled';
  startDate: string; dueDate: string; budget: number; spent: number;
  goals: string; risks: string;
};
export type Task = Entity & {
  projectId: string; title: string; duration: number; dependencies: string[];
  status: 'todo' | 'doing' | 'done'; assignee: string; progress: number;
};
export type Shift = Entity & {
  title: string; date: string; start: string; end: string; locationId: string;
  requiredSkills: string[]; requiredCount: number; volunteerIds: string[];
  status: 'draft' | 'confirmed' | 'active' | 'completed' | 'cancelled'; projectId: string; notes: string;
};
export type ActivityRecord = Entity & {
  volunteerId: string; shiftId: string; date: string; hours: number;
  serviceCount: number; category: string; notes: string;
  eventId?: string; customFields?: CustomValues;
};
export type Request = Entity & {
  title: string; category: 'consultation' | 'improvement' | 'incident' | 'coordination';
  priority: 'low' | 'normal' | 'high'; status: 'open' | 'in_progress' | 'resolved';
  owner: string; department: string; dueDate: string; description: string; resolution: string;
};
export type Resource = Entity & {
  name: string; category: string; locationId: string; quantity: number;
  available: number; inspectedDate: string; status: 'ready' | 'maintenance'; notes: string;
};
export type SceneScenario = Entity & {
  name: string; description: string;
  objects: Record<string, { x: number; y: number; z: number; rotation: number; hidden: boolean }>;
  additions: { id: string; kind: string; floor: string; x: number; y: number; z: number; rotation: number; name: string }[];
  routes: { id: string; volunteerId: string; shiftId: string; floor: string; points: { x: number; z: number }[] }[];
};
export type AuditEntry = { id: string; timestamp: string; actor: string; action: string; entity: string; entityId: string; summary: string };
export type Location = { id: string; name: string; floor: string; building: string; x: number; z: number; capacity: number; source: 'official' | 'concept'; description: string };
export type AppState = {
  volunteers: Volunteer[]; projects: Project[]; tasks: Task[]; shifts: Shift[];
  records: ActivityRecord[]; requests: Request[]; resources: Resource[]; scenarios: SceneScenario[];
  audit: AuditEntry[]; locations: Location[];
  events: ScheduledEvent[]; eventTypes: EventType[]; fieldDefinitions: FieldDefinition[]; entries: ProfileEntry[]; attachments: Attachment[];
};
export type Collection = 'volunteers' | 'projects' | 'tasks' | 'shifts' | 'records' | 'requests' | 'resources' | 'scenarios' | 'events' | 'eventTypes' | 'fieldDefinitions' | 'entries' | 'attachments';
export type PageId = 'dashboard' | 'projects' | 'volunteers' | 'schedule' | 'events' | 'spatial' | 'records' | 'support' | 'resources' | 'reports' | 'settings';
export type PageProps = {
  data: AppState; date: string; user: User; refresh: () => Promise<void>;
  notify: (message: string, kind?: 'success' | 'error') => void;
  navigate: (page: PageId) => void;
};
