// SPDX-License-Identifier: AGPL-3.0-only
import catalogURL from '../../content/spatial/catalog.json?url';
import { loadSpatialContent } from './loadSpatialContent';

/** Editable scene coordinates are local to a floor, in illustrative scene units. */
export type SpatialObject = {
  id: string;
  name: string;
  kind: string;
  category: 'architecture' | 'furniture' | 'equipment' | 'signage' | 'plant' | 'person';
  floor: string;
  zone: string;
  description: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  size: { x: number; y: number; z: number };
  editable: boolean;
};

export type SpatialAssetDefinition = Pick<SpatialObject, 'kind' | 'name' | 'category' | 'size' | 'description'>;

/** Original asset metadata is independently licensed declarative content. */
const catalog = await loadSpatialContent<{ assets: SpatialAssetDefinition[] }>(catalogURL);
export const ASSET_CATALOG: SpatialAssetDefinition[] = catalog.assets;
