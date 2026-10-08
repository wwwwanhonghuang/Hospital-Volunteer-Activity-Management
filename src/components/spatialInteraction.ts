// SPDX-License-Identifier: AGPL-3.0-only
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneScenario } from '../types';
import { ASSET_CATALOG, type SpatialObject } from './spatialTypes';
import { createSpatialAsset } from './spatialAssets';
import type { FullHospitalModel } from './hospitalModel';

export type SceneLayout = Pick<SceneScenario, 'objects' | 'additions' | 'routes'>;
export type SceneInteractionProps = {
  scenario?: SceneLayout;
  selectedObjectId?: string;
  onObjectSelect?: (id: string | null) => void;
  onObjectsChange?: (objects: SpatialObject[]) => void;
  onObjectTransform?: (id: string, transform: { x: number; y: number; z: number; rotation: number }) => void;
  editMode?: 'inspect' | 'translate' | 'rotate';
  focusRequest?: { id: string; sequence: number };
  routeDrawing?: boolean;
  routeDraft?: { x: number; z: number }[];
  onRoutePoint?: (point: { x: number; z: number }) => void;
  showPeople?: boolean;
  showStations?: boolean;
  topView?: boolean;
};
type Entry = { object: THREE.Object3D; info: SpatialObject };
const clamp = THREE.MathUtils.clamp;

/** Scene editing stays separate from source geometry. Transforms are floor-local. */
export function createSpatialInteraction(options: {
  scene: THREE.Scene; model: FullHospitalModel; camera: THREE.OrthographicCamera;
  orbit: OrbitControls; canvas: HTMLCanvasElement; floor: string;
  latest: () => SceneInteractionProps;
  onHover: (name: string) => void;
  card: () => HTMLDivElement | null;
}) {
  const { scene, model, camera, orbit, canvas, floor, latest } = options;
  const registry = new Map<string, Entry>(model.objects);
  const dynamic = new Set<string>();
  const additions = new Map<string, Entry>();
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setSize(.8); gizmo.setTranslationSnap(.25); gizmo.setRotationSnap(Math.PI / 12);
  scene.add(gizmo.getHelper());
  const outline = new THREE.BoxHelper(new THREE.Object3D(), 0x176b91);
  outline.material.depthTest = false; outline.material.transparent = true; outline.material.opacity = .85;
  outline.renderOrder = 1000; outline.visible = false; scene.add(outline);
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
  const draftLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({color:0xb77735,dashSize:.4,gapSize:.2,depthTest:false}));
  draftLine.renderOrder = 900; scene.add(draftLine);
  let dirty = true, lastScenario: SceneLayout | undefined, lastDraft: SceneInteractionProps['routeDraft'];
  let selection = '', mode = '', focusSequence = -1, lastTop: boolean | undefined;
  let pointerStart = {x:0,y:0}, gizmoGesture = false, hover = '';
  let active = true;
  const height = (id: string) => model.floorGroups.get(id)?.position.y || 0;
  const visible = (object: THREE.Object3D) => { let parent: THREE.Object3D | null = object; while(parent){if(!parent.visible)return false;parent=parent.parent;}return true; };
  const focus = (id: string) => {
    const entry = registry.get(id); if (!entry || !visible(entry.object)) return;
    const box = new THREE.Box3().setFromObject(entry.object); const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const direction = camera.position.clone().sub(orbit.target).normalize();
    orbit.target.copy(center); camera.position.copy(center).addScaledVector(direction, 140);
    camera.zoom = clamp((camera.top - camera.bottom) / Math.max(size.x, size.y, size.z, 5) * .55, .8, 12);
    camera.updateProjectionMatrix(); orbit.update();
  };
  const commit = () => {
    const entry = registry.get(selection); if (!entry || !entry.info.editable || !gizmo.object) return;
    const p = entry.object.position;
    p.set(clamp(p.x,-45,45),clamp(p.y,0,6),clamp(p.z,-22,22));
    const rotation = THREE.MathUtils.euclideanModulo(entry.object.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    entry.object.rotation.y = rotation;
    latest().onObjectTransform?.(selection,{x:p.x,y:p.y,z:p.z,rotation});
  };
  gizmo.addEventListener('dragging-changed', event => {
    orbit.enabled = !event.value;
    if(event.value)gizmoGesture=true; else commit();
  });
  const ray = (event: PointerEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
  };
  const hit = (event: PointerEvent | MouseEvent) => {
    ray(event);
    // Invisible ancestors are excluded because Three's raycaster does not do this itself.
    for(const intersection of raycaster.intersectObjects([...registry.values()].map(entry=>entry.object),true)){
      if(!visible(intersection.object))continue;
      let object: THREE.Object3D | null = intersection.object;
      while(object){const id=object.userData.spatialId as string | undefined;if(id&&registry.has(id))return id;object=object.parent;}
    }
    return null;
  };
  const down = (event: PointerEvent) => {pointerStart={x:event.clientX,y:event.clientY};gizmoGesture=!!gizmo.axis;};
  const up = (event: PointerEvent) => {
    if(event.button!==0 || gizmoGesture || Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)return;
    const state=latest();
    if(state.routeDrawing&&floor!=='all'){
      ray(event);const point=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-(height(floor)+.4)),new THREE.Vector3());
      if(point&&Math.abs(point.x)<=45&&Math.abs(point.z)<=22)state.onRoutePoint?.({x:Math.round(point.x*4)/4,z:Math.round(point.z*4)/4});
      return;
    }
    state.onObjectSelect?.(hit(event));
  };
  const move = (event: PointerEvent) => {
    if(event.buttons||gizmo.dragging)return;
    const id=hit(event);const name=id?registry.get(id)?.info.name||'':'';
    if(name!==hover){hover=name;options.onHover(name);}
    canvas.style.cursor=latest().routeDrawing?'crosshair':id?'pointer':'grab';
  };
  const leave = () => {hover='';options.onHover('');};
  const doubleClick = (event: MouseEvent) => {if(latest().routeDrawing)return;const id=hit(event);if(id)focus(id);};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);
  canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('dblclick',doubleClick);

  function applyScenario(state: SceneInteractionProps) {
    const layout = state.scenario;
    if(layout===lastScenario)return;
    lastScenario=layout;
    const ids=new Set(layout?.additions.map(item=>item.id)||[]);
    additions.forEach((entry,id)=>{if(!ids.has(id)){entry.object.removeFromParent();registry.delete(id);additions.delete(id);}});
    for(const item of layout?.additions||[]){
      const parent=model.floorGroups.get(item.floor);const definition=ASSET_CATALOG.find(asset=>asset.kind===item.kind);
      if(!parent||!definition)continue;
      let entry=additions.get(item.id);
      if(entry&&(entry.info.kind!==item.kind||entry.info.floor!==item.floor)){entry.object.removeFromParent();additions.delete(item.id);registry.delete(item.id);entry=undefined;}
      if(!entry){
        const object=createSpatialAsset(item.kind);object.name=item.name;Object.assign(object.userData,{spatialId:item.id,floor:item.floor,zone:'Scenario addition',provenance:'User-authored illustrative scenario object'});parent.add(object);
        entry={object,info:{...definition,id:item.id,name:item.name,floor:item.floor,zone:'Scenario addition',position:{x:item.x,y:item.y,z:item.z},rotation:item.rotation,editable:true}};
        additions.set(item.id,entry);registry.set(item.id,entry);
      }
      entry.info={...entry.info,name:item.name,position:{x:item.x,y:item.y,z:item.z},rotation:item.rotation};
    }
    for(const [id,entry] of registry){
      if(!entry.info.editable)continue;
      const transform=layout?.objects[id];const p=transform||entry.info.position;
      entry.object.position.set(p.x,p.y,p.z);entry.object.rotation.y=transform?.rotation??entry.info.rotation;
      entry.object.visible=!transform?.hidden;
    }
    dirty=true;
  }
  function update() {
    if(!active)return;
    const state=latest();applyScenario(state);
    if(dirty){
      dirty=false;
      state.onObjectsChange?.([...registry.values()].map(({object,info})=>({...info,position:{x:object.position.x,y:object.position.y-(info.category==='person'?height(info.floor):0),z:object.position.z},rotation:object.rotation.y})));
    }
    if(state.topView!==lastTop){
      if(lastTop!==undefined||state.topView){const target=orbit.target;camera.position.copy(target).add(state.topView?new THREE.Vector3(0,140,.01):new THREE.Vector3(85,72,100));orbit.minPolarAngle=state.topView?0:.05;orbit.update();}
      lastTop=state.topView;
    }
    if(state.focusRequest&&state.focusRequest.sequence!==focusSequence){focusSequence=state.focusRequest.sequence;focus(state.focusRequest.id);}
    // Project labels with this frame's damped camera transform, before rendering.
    camera.updateMatrixWorld(true);
    const id=state.selectedObjectId||'';
    const entry=registry.get(id);
    if(selection!==id||mode!==state.editMode||(!gizmo.object&&entry?.info.editable&&state.editMode!=='inspect')){
      selection=id;mode=state.editMode||'inspect';gizmo.detach();
      if(entry?.info.editable&&visible(entry.object)&&mode!=='inspect'&&floor!=='all'&&!state.routeDrawing){
        gizmo.setMode(mode as 'translate'|'rotate');gizmo.showX=mode==='translate';gizmo.showY=mode==='rotate';gizmo.showZ=mode==='translate';gizmo.attach(entry.object);
      }
    }
    if(gizmo.object&&(!entry||!visible(entry.object)||state.routeDrawing))gizmo.detach();
    outline.visible=!!entry&&visible(entry.object);
    const card=options.card();
    if(entry&&outline.visible){
      outline.setFromObject(entry.object);
      if(card){const box=new THREE.Box3().setFromObject(entry.object);const position=box.getCenter(new THREE.Vector3());position.y=box.max.y+.9;position.project(camera);card.style.left=`${clamp((position.x+1)*.5*canvas.clientWidth,110,canvas.clientWidth-110)}px`;card.style.top=`${clamp((1-position.y)*.5*canvas.clientHeight,68,canvas.clientHeight-120)}px`;card.style.visibility=position.z>=-1&&position.z<=1?'visible':'hidden';}
    }else if(card)card.style.visibility='hidden';
    if(state.routeDraft!==lastDraft){lastDraft=state.routeDraft;draftLine.geometry.dispose();draftLine.geometry=new THREE.BufferGeometry().setFromPoints((lastDraft||[]).map(p=>new THREE.Vector3(p.x,height(floor)+.45,p.z)));draftLine.computeLineDistances();}
    draftLine.visible=!!state.routeDrawing&&(lastDraft?.length||0)>1;
  }
  return {
    update,
    registerPerson(id: string, object: THREE.Group, info: SpatialObject) {object.userData.spatialId=id;registry.set(id,{object,info});dynamic.add(id);dirty=true;},
    clearPeople() {dynamic.forEach(id=>registry.delete(id));dynamic.clear();dirty=true;},
    dispose() {active=false;gizmo.detach();gizmo.dispose();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('dblclick',doubleClick);},
  };
}
