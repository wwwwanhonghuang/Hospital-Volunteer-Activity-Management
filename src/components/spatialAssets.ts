// SPDX-License-Identifier: AGPL-3.0-only
import * as THREE from 'three';
import artworkURL from '../../content/spatial/assets.json?url';
import { loadSpatialContent } from './loadSpatialContent';

type Joint = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
type FigureBinding = { uuid: string; joints: Record<Joint, string> };
type SpatialArtwork = {
  format: string;
  version: number;
  bindings: { assets: Record<string, string>; figures: FigureBinding[] };
  scene: Parameters<THREE.ObjectLoader['parse']>[0];
};

// The original object designs are a separate, non-executable CC BY-NC-SA asset.
// This loader only interprets Three.js scene data and exposes reusable instances.
const artwork = await loadSpatialContent<SpatialArtwork>(artworkURL);
if (artwork.format !== 'shuori-spatial-artwork' || artwork.version !== 1) {
  throw new Error('Unsupported spatial artwork format.');
}
const collection = new THREE.ObjectLoader().parse(artwork.scene);
const requireGroup = (uuid: string) => {
  const object = collection.getObjectByProperty('uuid', uuid);
  if (!(object instanceof THREE.Group)) throw new Error(`Spatial artwork group is missing: ${uuid}`);
  return object;
};
const assetTemplates = new Map(Object.entries(artwork.bindings.assets).map(([kind, uuid]) => [kind, requireGroup(uuid)]));
const figureTemplates = artwork.bindings.figures.map(binding => ({ binding, root: requireGroup(binding.uuid) }));
if (!figureTemplates.length) throw new Error('Spatial artwork has no figure templates.');
const uniformMaterials = new Map<number, THREE.MeshStandardMaterial>();

/** Clone a selectable assembly; immutable geometry and materials stay shared. */
export function createSpatialAsset(kind: string): THREE.Group {
  const template = assetTemplates.get(kind);
  if (!template) throw new Error(`Unknown spatial asset: ${kind}`);
  return template.clone(true);
}

export type VolunteerFigure = { root: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group };

/** Bind named pivots and uniform channels declared by the supplied figure asset. */
export function createVolunteerFigure(color: number, index: number): VolunteerFigure {
  if (!Number.isFinite(index)) throw new Error('Figure variant index must be finite.');
  const { binding, root: template } = figureTemplates[Math.abs(Math.trunc(index)) % figureTemplates.length];
  const root = template.clone(true);
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.materialChannel !== 'uniform') return;
    if (!(object.material instanceof THREE.MeshStandardMaterial)) throw new Error('Invalid figure uniform material.');
    if (!uniformMaterials.has(color)) {
      const material = object.material.clone();
      material.color.setHex(color);
      uniformMaterials.set(color, material);
    }
    object.material = uniformMaterials.get(color)!;
  });
  const joints = {} as Record<Joint, THREE.Group>;
  for (const key of Object.keys(binding.joints) as Joint[]) {
    const joint = root.getObjectByName(binding.joints[key]);
    if (!(joint instanceof THREE.Group) || joint.parent !== root) throw new Error(`Figure joint is missing: ${key}`);
    // Matrix decomposition may produce signed zero; expose stable joint values.
    for (const axis of ['x', 'y', 'z'] as const) if (joint.rotation[axis] === 0) joint.rotation[axis] = 0;
    joints[key] = joint;
  }
  return { root, ...joints };
}
