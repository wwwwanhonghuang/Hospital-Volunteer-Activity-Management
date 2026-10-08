// SPDX-License-Identifier: AGPL-3.0-only
/** Deterministic critical-path analysis in calendar-day units (day zero is project start; no holiday calendar). */
export function calculateCPM(tasks) {
  if (!Array.isArray(tasks)) throw new Error('Tasks must be an array.');
  const byId = new Map();
  for (const task of tasks) {
    if (!task.id || byId.has(task.id)) throw new Error('Task IDs must be unique.');
    if (!Number.isFinite(task.duration) || task.duration < 1) throw new Error('Task durations must be at least one day.');
    byId.set(task.id, task);
  }
  const ordered = [], visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('Task dependencies contain a cycle.');
    if (visited.has(id)) return;
    const task = byId.get(id);
    if (!task) throw new Error(`Missing predecessor: ${id}`);
    visiting.add(id);
    for (const predecessor of task.dependencies || []) {
      const parent = byId.get(predecessor);
      if (!parent) throw new Error(`Missing predecessor: ${predecessor}`);
      if (task.projectId && parent.projectId && task.projectId !== parent.projectId) throw new Error('Dependencies must stay within one project.');
      visit(predecessor);
    }
    visiting.delete(id); visited.add(id); ordered.push(task);
  }
  tasks.forEach(task => visit(task.id));
  const results = new Map();
  for (const task of ordered) {
    const es = Math.max(0, ...(task.dependencies || []).map(id => results.get(id).ef));
    results.set(task.id, { id: task.id, es, ef: es + task.duration, ls: 0, lf: 0, slack: 0, critical: false });
  }
  const duration = Math.max(0, ...[...results.values()].map(task => task.ef));
  for (const task of [...ordered].reverse()) {
    const successors = ordered.filter(other => (other.dependencies || []).includes(task.id));
    const result = results.get(task.id);
    result.lf = successors.length ? Math.min(...successors.map(successor => results.get(successor.id).ls)) : duration;
    result.ls = result.lf - task.duration; result.slack = result.ls - result.es;
    result.critical = Math.abs(result.slack) < 1e-9;
  }
  // One connected longest path; tasks marks every critical branch independently.
  const criticalPath = [];
  let current = ordered.find(task => results.get(task.id).critical && results.get(task.id).ef === duration);
  while (current) {
    criticalPath.unshift(current.id);
    current = (current.dependencies || []).map(id => byId.get(id)).find(parent => results.get(parent.id).critical && results.get(parent.id).ef === results.get(current.id).es);
  }
  return { tasks: tasks.map(task => results.get(task.id)), duration, criticalPath };
}
