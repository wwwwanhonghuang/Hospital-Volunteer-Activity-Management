// SPDX-License-Identifier: AGPL-3.0-only
import * as THREE from 'three';
import type { Location } from '../types';
import buildingURL from '../../content/spatial/building.json?url';
import { createSpatialAsset } from './spatialAssets';
import { loadSpatialContent } from './loadSpatialContent';
import type { SpatialObject } from './spatialTypes';

export type HospitalFloor = { id: string; level: number; title: string; summary: string; source: string; zones: string[]; color: string };
export type ModelZone = { name: string; x: number; z: number; w: number; d: number; type?: 'office' | 'clinic' | 'library' | 'imaging' | 'dining' | 'rehab' | 'retail' | 'surgery' };
type Label = { name: string; x: number; y: number; z: number; floor: string };
type CoordinateMapping = { scaleX: number; offsetX: number; scaleZ: number; offsetZ: number };
type BuildingContent = {
  floors: HospitalFloor[];
  zones: Record<string, ModelZone[]>;
  labels: Label[];
  objects: { id: string; info: SpatialObject; scale: [number, number, number] }[];
  scene: ReturnType<THREE.Object3D['toJSON']>;
  locationMapping: {
    default: CoordinateMapping;
    floors: Record<string, CoordinateMapping>;
    points: Record<string, { x: number; z: number }>;
  };
  circulation: {
    width: number; depth: number; heightPadding: number;
    positions: { x: number; z: number }[];
    material: THREE.MeshStandardMaterialParameters;
    name: string;
  };
};

// Model geometry, layout, palette and descriptions remain a separate CC asset.
// This module only loads that declarative content and manages display state.
const building = await loadSpatialContent<BuildingContent>(buildingURL);
export const HOSPITAL_FLOORS: HospitalFloor[] = building.floors;
export const MODEL_ZONES: Record<string, ModelZone[]> = building.zones;
const sourceObjects = new Map(building.objects.map(entry => [entry.id, entry]));
let template: THREE.Group | undefined;

/** Convert operational coordinates using the model's declared coordinate map. */
export function modelLocation(location: Location): Location {
  const floorMapping = building.locationMapping.floors[location.floor];
  const point = building.locationMapping.points[location.id];
  if (!floorMapping && point) return { ...location, ...point };
  const mapping = floorMapping || building.locationMapping.default;
  return {
    ...location,
    x: location.x * mapping.scaleX + mapping.offsetX,
    z: location.z * mapping.scaleZ + mapping.offsetZ,
  };
}

export type FullHospitalModel = {
  root: THREE.Group;
  floorGroups: Map<string, THREE.Group>;
  labels: Label[];
  skin: THREE.Group[];
  routeCores: THREE.Group;
  objects: Map<string, { object: THREE.Object3D; info: SpatialObject }>;
  setExplode: (gap: number) => void;
};

export function buildFullHospital(selectedFloor: string, gap = 9): FullHospitalModel {
  template ??= new THREE.ObjectLoader().parse(building.scene) as THREE.Group;
  const root = template.clone(true);
  const floorGroups = new Map<string, THREE.Group>();
  const skin: THREE.Group[] = [];
  const objects: FullHospitalModel['objects'] = new Map();
  let routeCores: THREE.Group | undefined;

  for (const child of [...root.children]) {
    const floor = child.userData.floorRoot as string | undefined;
    if (floor) {
      if (selectedFloor === 'all' || selectedFloor === floor) floorGroups.set(floor, child as THREE.Group);
      else root.remove(child);
    }
    if (child.userData.routeCores) routeCores = child as THREE.Group;
  }
  if (!routeCores) throw new Error('Building content is missing its circulation group.');

  // Collect first, then replace asset placeholders without mutating traversal.
  const entries: THREE.Object3D[] = [];
  root.traverse(object => {
    if (object.userData.facadeBand) skin.push(object as THREE.Group);
    if (object.userData.spatialId) entries.push(object);
  });
  for (const placeholder of entries) {
    const source = sourceObjects.get(placeholder.userData.spatialId);
    if (!source) throw new Error(`Building content has an unknown object: ${placeholder.userData.spatialId}`);
    const info = structuredClone(source.info);
    let object = placeholder;
    if (placeholder.userData.assetKind) {
      object = createSpatialAsset(placeholder.userData.assetKind);
      const parent = placeholder.parent!;
      const index = parent.children.indexOf(placeholder);
      parent.remove(placeholder);
      parent.add(object);
      parent.children.splice(parent.children.indexOf(object), 1);
      parent.children.splice(index, 0, object);
    }
    // Explicit transforms preserve exact scene-editing values after JSON matrix
    // decomposition, including quarter-turn rotations and scaled instances.
    object.position.set(info.position.x, info.position.y, info.position.z);
    object.rotation.set(0, info.rotation, 0);
    object.scale.fromArray(source.scale);
    object.name = info.name;
    object.userData = { ...object.userData, spatialId: info.id, floor: info.floor, zone: info.zone };
    objects.set(info.id, { object, info });
  }

  const connectors = routeCores;
  const setExplode = (separation: number) => {
    let index = 0;
    floorGroups.forEach(group => { group.position.y = selectedFloor === 'all' ? index++ * separation : 0; });
    connectors.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    connectors.clear();
    if (selectedFloor === 'all') {
      const config = building.circulation;
      const height = (floorGroups.size - 1) * separation + config.heightPadding;
      for (const position of config.positions) {
        const shaft = new THREE.Mesh(
          new THREE.BoxGeometry(config.width, height, config.depth),
          new THREE.MeshStandardMaterial(config.material),
        );
        shaft.position.set(position.x, height / 2, position.z);
        shaft.name = config.name;
        connectors.add(shaft);
      }
    }
  };
  setExplode(gap);
  const labels = building.labels.filter(label => floorGroups.has(label.floor)).map(label => ({ ...label }));
  return { root, floorGroups, labels, skin, routeCores: connectors, objects, setExplode };
}
