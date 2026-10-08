import type { z } from 'zod';
import type { AppState, SceneScenario } from '../src/types';
export const SPATIAL_FLOORS: readonly ['B3', 'B1', '1F', '2F', '3F', '4F', '6F', '7F'];
export const SPATIAL_ASSET_KINDS: readonly ['chair', 'desk', 'counter', 'bookshelf', 'wheelchair', 'bed', 'cart', 'kiosk', 'sign', 'planter', 'scanner', 'rehab-bars', 'bench', 'privacy-screen', 'table'];
export const SCENARIO_LIMITS: Readonly<{ objects: number; additions: number; routes: number; routePoints: number; x: number; z: number; y: number }>;
export const scenarioSchema: z.ZodType<Omit<SceneScenario, 'id' | 'version' | 'createdAt' | 'updatedAt'>>;
export function validateScenario(value: unknown, state?: Pick<AppState, 'volunteers' | 'shifts' | 'locations'>): { valid: boolean; errors: string[] };
