// SPDX-License-Identifier: AGPL-3.0-only
export type Role = 'admin' | 'coordinator' | 'viewer';
export type User = { id: string; name: string; username: string; role: Role };
export type Entity = { id: string; version: number; createdAt?: string; updatedAt?: string };
export type Volunteer = Entity & {
  name: string; kana: string; email: string; phone: string;
  status: 'applicant' | 'onboarding' | 'active' | 'paused' | 'archived';
  skills: string[]; languages: string[];
  trainingStatus: 'pending' | 'complete'; healthStatus: 'pending' | 'cleared' | 'followup';
  healthDueDate: string; availability: string[]; availableFrom: string; availableTo: string;
  maxHoursPerWeek: number; joinedDate: string; notes: string;
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
};
export type Collection = 'volunteers' | 'projects' | 'tasks' | 'shifts' | 'records' | 'requests' | 'resources' | 'scenarios';
export type PageId = 'dashboard' | 'projects' | 'volunteers' | 'schedule' | 'spatial' | 'records' | 'support' | 'resources' | 'reports' | 'settings';
export type PageProps = {
  data: AppState; date: string; user: User; refresh: () => Promise<void>;
  notify: (message: string, kind?: 'success' | 'error') => void;
  navigate: (page: PageId) => void;
};
