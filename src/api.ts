// SPDX-License-Identifier: AGPL-3.0-only
import type { AppState, Collection, Entity, User } from './types';
let csrfToken = '';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options, credentials: 'same-origin', headers: {
      'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers,
    },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') window.dispatchEvent(new Event('komorebi-session-expired'));
    throw new Error(value.error || `Request failed (${response.status})`);
  }
  return value as T;
}
export async function getSession() {
  const session = await api<{ user: User | null; csrfToken: string; mode: 'demo' | 'production' }>('/session');
  csrfToken = session.csrfToken || ''; return session;
}
export async function login(username: string, password: string, demo = false) {
  const result = await api<{user: User; csrfToken: string}>(demo ? '/demo-login' : '/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  csrfToken = result.csrfToken; return result;
}
export async function logout() { await api('/logout', { method: 'POST' }); csrfToken = ''; }
export const getState = () => api<AppState>('/state');
export const saveEntity = <T extends object>(collection: Collection, value: T & Partial<Entity>) => api<T>(`/${collection}${value.id ? `/${value.id}` : ''}`, { method: value.id ? 'PUT' : 'POST', body: JSON.stringify(value) });
export const deleteEntity = (collection: Collection, value: Entity) => api(`/${collection}/${value.id}`, { method: 'DELETE', body: JSON.stringify({version: value.version}) });
export async function downloadFile(path: string, filename: string) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin' });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('komorebi-session-expired'));
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Download failed (${response.status}). Please try again.`);
  }
  const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExcelExportRequest = {
  kind: Collection | 'locations' | 'workspace' | 'monthly-report' | 'readiness' | 'project-plan' | 'schedule';
  ids?: string[];
  month?: string;
  date?: string;
  projectId?: string;
  scopeLabel?: string;
};

/** Export a server snapshot using the same authenticated session as the workspace. */
export async function downloadExcel(request: ExcelExportRequest): Promise<string> {
  const response = await fetch('/api/export/xlsx', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('komorebi-session-expired'));
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `The workbook could not be exported (${response.status}). Please try again.`);
  }
  if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
    throw new Error('The server did not return an Excel workbook. Please retry the export.');
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let proposed = disposition.match(/filename="([^"]+)"/i)?.[1] || `shuori-${request.kind}.xlsx`;
  if (encoded) { try { proposed = decodeURIComponent(encoded); } catch { /* Retain the plain filename. */ } }
  const filename = proposed.replace(/[\\/\x00-\x1f]/g, '-').replace(/^\.+/, '') || `shuori-${request.kind}.xlsx`;
  const blob = await response.blob();
  if (!blob.size) throw new Error('The workbook was empty. Please retry the export.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
