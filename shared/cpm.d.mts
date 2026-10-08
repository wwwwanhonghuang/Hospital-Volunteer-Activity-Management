import type { Task } from '../src/types';
export type CPMResult = { tasks: { id: string; es: number; ef: number; ls: number; lf: number; slack: number; critical: boolean }[]; duration: number; criticalPath: string[] };
export function calculateCPM(tasks: Task[]): CPMResult;
