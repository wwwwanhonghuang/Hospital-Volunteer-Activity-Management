// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Camera, Download, Minus, Plus, RotateCcw, ScanLine } from 'lucide-react';
import type { Location, Shift, Volunteer } from '../types';
import { buildFullHospital, HOSPITAL_FLOORS, MODEL_ZONES, modelLocation } from './hospitalModel';
import { createVolunteerFigure } from './spatialAssets';
import { createSpatialInteraction, type SceneInteractionProps } from './spatialInteraction';
import '../spatial.css';

export type HospitalSceneProps = SceneInteractionProps & {
  locations: Location[];
  /** The caller supplies shifts for one selected date. */
  shifts: Shift[];
  volunteers?: Volunteer[];
  minute: number;
  floor: string;
  playing?: boolean;
  heatmap?: boolean;
  routes?: boolean;
  selectedLocation?: string;
  onSelect?: (id: string) => void;
  compact?: boolean;
  resetKey?: number;
  explode?: number;
  showSkin?: boolean;
  showZoneLabels?: boolean;
  onFloorChange?: (floor: string) => void;
  objectDetail?: {name:string;category:string;floor:string;zone:string};
};

export const stationColors: Record<string, string> = {
  entrance: '#258fb2', reception: '#b88a44', outpatient: '#688b94',
  library: '#93799c', garden: '#648f82', coordination: '#8f8e75',
};
export function timeMinute(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
export function shiftsAt(shifts: Shift[], minute: number) {
  return shifts.filter(s => s.status !== 'cancelled' && s.status !== 'draft' && timeMinute(s.start) <= minute && timeMinute(s.end) > minute);
}
export function stationCount(shifts: Shift[], locationId: string) {
  return new Set(shifts.filter(s => s.locationId === locationId).flatMap(s => s.volunteerIds)).size;
}
const colorOf = (id: string) => stationColors[id] || '#56899e';
const abbreviate = (location: Location) => ({ entrance: 'Main entrance', reception: 'Reception', outpatient: 'Outpatient', coordination: 'Volunteer hub', garden: 'Garden', library: 'Nikoniko Bunko+' }[location.id] || location.name);
const seedOf = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 997, 0);

/** A conceptual corridor graph, expressed in arbitrary scene units. */
function routeFor(location: Location): THREE.Vector3[] {
  const start = location.floor === '6F' ? new THREE.Vector3(-9, .36, -2.7) : new THREE.Vector3(-27, .36, 15);
  return [start, new THREE.Vector3(start.x, .36, 0), new THREE.Vector3(location.x, .36, 0), new THREE.Vector3(location.x, .36, location.z)];
}
function routePosition(location: Location, minute: number, id: string, custom?: {x:number;z:number}[]) {
  const points = custom?.length ? custom.map(p=>new THREE.Vector3(p.x,.36,p.z)) : routeFor(location);
  const segments = points.slice(1).map((p, i) => p.distanceTo(points[i]));
  const total = segments.reduce((a, b) => a + b, 0);
  // One arbitrary round trip every 24 simulation minutes; this is not measured travel time.
  let fraction = ((minute / 24 + seedOf(id) / 997) % 1) * 2;
  if (fraction > 1) fraction = 2 - fraction;
  let distance = fraction * total;
  for (let i = 0; i < segments.length; i++) {
    if (distance <= segments[i] && segments[i] > 0) return points[i].clone().lerp(points[i + 1], distance / segments[i]);
    distance -= segments[i];
  }
  return points.at(-1)!.clone();
}

export function HospitalScene(props: HospitalSceneProps) {
  const { locations, shifts, minute, floor, compact = false, selectedLocation, onSelect, resetKey = 0 } = props;
  const container = useRef<HTMLDivElement>(null);
  const labels = useRef<Record<string, HTMLButtonElement | null>>({});
  const latest = useRef(props); latest.current = props;
  const api = useRef<{ reset: () => void; zoom: (factor: number) => void; export: () => Promise<void>; capture: () => void } | null>(null);
  const floorLabels = useRef<Record<string, HTMLButtonElement | null>>({});
  const objectCard = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState('');
  const [planView, setPlanView] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [ready, setReady] = useState(false);
  const [exportState, setExportState] = useState('');
  const floorLocations = useMemo(() => locations.filter(l => floor === 'all' || l.floor === floor).map(modelLocation), [locations, floor]);
  const active = shiftsAt(shifts, minute);
  const fallback = planView || webglError;

  useEffect(()=>{if(!exportState||exportState==='Preparing model…')return;const timeout=window.setTimeout(()=>setExportState(''),3500);return()=>window.clearTimeout(timeout);},[exportState]);
  useEffect(() => { api.current?.reset(); }, [resetKey]);
  useEffect(() => {if(fallback){latest.current.onObjectsChange?.([]);latest.current.onObjectSelect?.(null);}},[fallback]);
  useEffect(() => {
    if (fallback || !container.current) return;
    const host = container.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
    } catch { setWebglError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    renderer.setClearColor(0xedf7fb, 0);
    renderer.domElement.setAttribute('aria-label', `Conceptual ${floor} hospital model. Use the station buttons to select an area.`);
    renderer.domElement.setAttribute('role', 'img');
    host.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-48, 48, 30, -30, .1, 600);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .09; controls.enablePan = !compact;
    controls.minPolarAngle = .22; controls.maxPolarAngle = Math.PI / 2.2;
    controls.minZoom = .55; controls.maxZoom = 16; controls.zoomToCursor = false;
    const reset = () => { const center = floor === 'all' ? (latest.current.explode || 9) * 3.5 : 0; camera.position.copy(latest.current.topView?new THREE.Vector3(0,140+center,.01):new THREE.Vector3(85,72+center,100));controls.minPolarAngle=latest.current.topView?0:.05; controls.target.set(0, center, 0); camera.zoom = compact ? 1.14 : floor === 'all' ? .92 : 1.19; camera.updateProjectionMatrix(); controls.update(); };
    scene.add(new THREE.AmbientLight(0xffffff, .65));
    scene.add(new THREE.HemisphereLight(0xf4fbff, 0xafc8d6, .7));
    const sun = new THREE.DirectionalLight(0xf8fcff, 2.1); sun.position.set(-30, 130, 50); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -75; sun.shadow.camera.far = 300; sun.shadow.bias = -.0008; scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.ShadowMaterial({ opacity: .1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.9; ground.receiveShadow = true; scene.add(ground);
    const model = buildFullHospital(floor, latest.current.explode || 9); scene.add(model.root);
    const interaction = !compact ? createSpatialInteraction({scene,model,camera,orbit:controls,canvas:renderer.domElement,floor,latest:()=>latest.current,onHover:setHover,card:()=>objectCard.current}) : null;
    const zoneLabelGroup = new THREE.Group(); scene.add(zoneLabelGroup);
    const textures: THREE.Texture[] = [];
    for (const label of model.labels) {
      const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=128;
      const context = canvas.getContext('2d'); if (!context) continue;
      context.fillStyle='rgba(248,252,255,0.95)'; context.beginPath(); context.roundRect(4,20,504,88,14); context.fill();
      context.strokeStyle='#d7e7ef'; context.lineWidth=2; context.stroke();
      context.fillStyle='#345f78'; context.font='500 27px Arial'; context.textAlign='center'; context.textBaseline='middle';
      const words=label.name.split(' '); const lines:string[]=[]; let line='';
      for(const word of words){if(context.measureText(`${line} ${word}`).width>470&&line){lines.push(line);line=word;}else line=line?`${line} ${word}`:word;}lines.push(line);
      lines.slice(0,2).forEach((value,index)=>context.fillText(value,256,lines.length>1?46+index*34:64));
      const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; textures.push(texture);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));
      sprite.position.set(label.x,label.y,label.z);sprite.scale.set(12,3,1);sprite.userData={floor:label.floor,baseY:label.y};zoneLabelGroup.add(sprite);
    }
    const download = (blob: Blob, filename: string) => { const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1500); };
    api.current = {
      reset,
      zoom: factor => { camera.zoom = Math.max(.55, Math.min(16, camera.zoom * factor)); camera.updateProjectionMatrix(); },
      export: async () => {
        setExportState('Preparing model…');
        try {const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');const result=await new GLTFExporter().parseAsync(model.root,{binary:true,onlyVisible:true});download(new Blob([result as ArrayBuffer],{type:'model/gltf-binary'}),`shuori-hospital-${floor}-schematic.glb`);setExportState('Model downloaded');}
        catch{setExportState('Model export failed. Please retry.');}
      },
      capture: () => {renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(blob){download(blob,`shuori-hospital-${floor}.png`);setExportState('Image downloaded');}});},
    };
    const routeGroup = new THREE.Group(); const heatGroup = new THREE.Group(); scene.add(routeGroup, heatGroup);
    const rings: { ring: THREE.Mesh; location: Location }[] = [];
    for (const location of floorLocations) {
      const points = routeFor(location);
      const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: colorOf(location.id), dashSize: .42, gapSize: .22, transparent: true, opacity: .8 }));
      path.computeLineDistances();path.userData.floor=location.floor; routeGroup.add(path);
      const disk = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshBasicMaterial({ color: colorOf(location.id), transparent: true, opacity: .12, depthWrite: false }));
      disk.rotation.x = -Math.PI / 2; disk.position.set(location.x, .38, location.z);disk.userData.floor=location.floor; heatGroup.add(disk);
      const ring = new THREE.Mesh(new THREE.RingGeometry(.46, .57, 32), new THREE.MeshBasicMaterial({ color: colorOf(location.id), side: THREE.DoubleSide, transparent: true, opacity: .8 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(location.x, .39, location.z); scene.add(ring); rings.push({ ring, location });
    }
    const tokenGroup = new THREE.Group(); scene.add(tokenGroup);
    const tokenMap = new Map<string, { figure: ReturnType<typeof createVolunteerFigure>; location: Location }>();
    const customRoutes = new THREE.Group(); scene.add(customRoutes);
    let customSignature = '';
    let tokenSignature = ''; let previousGap=latest.current.explode||9;
    const updateTokens = () => {
      const state = latest.current;
      const gap=state.explode||9;
      if(gap!==previousGap){const delta=(gap-previousGap)*3.5;model.setExplode(gap);if(floor==='all'){controls.target.y+=delta;camera.position.y+=delta;camera.zoom=.92*Math.min(1,9/gap);camera.updateProjectionMatrix();}previousGap=gap;}
      const floorHeight=(id:string)=>model.floorGroups.get(id)?.position.y||0;
      model.skin.forEach(s=>{s.visible=state.showSkin!==false;});model.routeCores.visible=state.routes!==false;
      zoneLabelGroup.visible=!!state.showZoneLabels&&floor!=='all'&&!compact;
      zoneLabelGroup.children.forEach(label=>{label.position.y=label.userData.baseY+floorHeight(label.userData.floor);});
      routeGroup.children.forEach(route=>{route.position.y=floorHeight(route.userData.floor);});
      const assignments = shiftsAt(state.shifts, state.minute).flatMap(shift => {
        const location = floorLocations.find(l => l.id === shift.locationId);
        return location ? shift.volunteerIds.map(id => ({ key: `person:${shift.id}:${id}`, id, location, shift })) : [];
      });
      const signature = assignments.map(a => a.key).join('|');
      if (signature !== tokenSignature) {
        tokenGroup.clear(); interaction?.clearPeople(); tokenMap.clear(); tokenSignature = signature;
        assignments.forEach(({ key, id, location, shift }) => {
          const figure=createVolunteerFigure(new THREE.Color(colorOf(location.id)).getHex(),seedOf(id));
          figure.root.name=state.volunteers?.find(v=>v.id===id)?.name||'Scheduled volunteer';
          tokenGroup.add(figure.root);tokenMap.set(key,{figure,location});
          interaction?.registerPerson(key,figure.root,{id:key,name:figure.root.name,kind:'volunteer',category:'person',floor:location.floor,zone:location.name,description:`${shift.title} · ${shift.start}–${shift.end} · ${shift.status}. Animated route is a planning rehearsal.`,position:{x:location.x,y:.36,z:location.z},rotation:0,size:{x:.7,y:1.75,z:.5},editable:false});
        });
      }
      assignments.forEach(({ key, id, location, shift }) => { const token = tokenMap.get(key); if (token) {
        const custom=state.scenario?.routes.find(route=>route.volunteerId===id&&route.shiftId===shift.id)?.points;
        const point=routePosition(location,state.minute,id,custom);const ahead=routePosition(location,state.minute+.015,id,custom);
        token.figure.root.position.copy(point);token.figure.root.position.y+=floorHeight(location.floor);
        if(point.distanceToSquared(ahead)>.0000001)token.figure.root.rotation.y=Math.atan2(ahead.x-point.x,ahead.z-point.z);
        const stride=Math.sin(state.minute*12+seedOf(id))*.5;
        token.figure.leftLeg.rotation.x=stride;token.figure.rightLeg.rotation.x=-stride;token.figure.leftArm.rotation.x=-stride*.6;token.figure.rightArm.rotation.x=stride*.6;
      } });
      tokenGroup.visible=state.showPeople!==false;
      const nextSignature=JSON.stringify(state.scenario?.routes||[]);
      if(nextSignature!==customSignature){customRoutes.children.forEach(object=>{const line=object as THREE.Line;line.geometry.dispose();(line.material as THREE.Material).dispose();});customRoutes.clear();customSignature=nextSignature;
        for(const route of state.scenario?.routes||[]){if(!model.floorGroups.has(route.floor))continue;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(route.points.map(p=>new THREE.Vector3(p.x,.44,p.z))),new THREE.LineDashedMaterial({color:0xb57535,dashSize:.5,gapSize:.2}));line.computeLineDistances();line.userData.floor=route.floor;customRoutes.add(line);}}
      customRoutes.visible=state.routes!==false;customRoutes.children.forEach(route=>{route.position.y=floorHeight(route.userData.floor);});
      routeGroup.visible = state.routes !== false;
      heatGroup.visible = !!state.heatmap;
      heatGroup.children.forEach((child, i) => {
        const count = stationCount(shiftsAt(state.shifts, state.minute), floorLocations[i].id);
        (child as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>).material.opacity = count ? Math.min(.4, .08 + count * .065) : .025;
        child.scale.setScalar(1 + count * .09);
        child.position.y=.38+floorHeight(child.userData.floor);
      });
      rings.forEach(({ ring, location }) => {ring.scale.setScalar(state.selectedLocation === location.id ? 1.45 : 1);ring.position.y=.4+floorHeight(location.floor);});
    };
    const resize = () => {
      const width = host.clientWidth, height = host.clientHeight;
      if (!width || !height) return;
      const aspect = width / height;
      const halfHeight = Math.max(floor==='all'?50:27, 49 / aspect);
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.updateProjectionMatrix(); renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize(); reset();
    let raf = 0, disposed = false, lastFrame = 0;
    const projection = new THREE.Vector3();
    const animate = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(animate);
      if (now - lastFrame < 30 || document.hidden) return;
      lastFrame = now; controls.update(); camera.updateMatrixWorld(true); updateTokens(); interaction?.update();
      for (const location of floorLocations) {
        const label = labels.current[location.id]; if (!label) continue;
        label.style.display=latest.current.showStations===false?'none':'';
        projection.set(location.x, 2.2+(model.floorGroups.get(location.floor)?.position.y||0), location.z).project(camera);
        const offsets:Record<string,number[]>={entrance:[-40,19],reception:[-38,-9],outpatient:[57,-8],coordination:[-15,-27],garden:[23,10],library:[0,-8]};
        const [dx,dy]=offsets[location.id]||[0,0];const factor=compact?.55:1;
        const projectedLeft = (projection.x + 1) * .5 * host.clientWidth + dx * factor;
        const labelInset = label.offsetWidth / 2 + 6;
        label.style.left = `${Math.max(labelInset, Math.min(host.clientWidth - labelInset, projectedLeft))}px`;
        label.style.top = `${(1 - projection.y) * .5 * host.clientHeight+dy*factor}px`;
        label.style.opacity = projection.z >= -1 && projection.z <= 1 ? '1' : '0';
      }
      if(floor==='all')for(const definition of HOSPITAL_FLOORS){const label=floorLabels.current[definition.id];if(!label)continue;projection.set(-41,(model.floorGroups.get(definition.id)?.position.y||0)+.5,0).project(camera);label.style.left=`${(projection.x+1)*.5*host.clientWidth}px`;label.style.top=`${(1-projection.y)*.5*host.clientHeight}px`;}
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate); setReady(true);
    const contextLost = (event: Event) => { event.preventDefault(); setWebglError(true); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    return () => {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); interaction?.dispose(); controls.dispose(); api.current = null;
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose(); const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(m => m.dispose());
        }
      });
      zoneLabelGroup.children.forEach(label=>{(label as THREE.Sprite).material.dispose();});textures.forEach(texture=>texture.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [floor, floorLocations, compact, fallback]);

  return <div className={`hospital-scene ${compact ? 'scene-compact' : ''} ${floor==='all'?'scene-building':''} ${fallback ? 'scene-plan' : ''}`} data-testid="hospital-scene">
    <div ref={container} className="scene-stage">
      {!fallback&&props.objectDetail&&<div ref={objectCard} className="scene-object-card"><span>{props.objectDetail.category} · {props.objectDetail.floor}</span><strong>{props.objectDetail.name}</strong><small>{props.objectDetail.zone}</small><button aria-label="Clear object selection" onClick={()=>props.onObjectSelect?.(null)}>×</button></div>}
      {fallback && floor==='all'? <div className="scene-floor-fallback">{[...HOSPITAL_FLOORS].reverse().map(definition=><button key={definition.id} onClick={()=>props.onFloorChange?.(definition.id)}><strong style={{color:definition.color}}>{definition.id}</strong><span>{definition.title}<small>{definition.zones.length} reference zones · inspect floor →</small></span></button>)}</div> : fallback ? <svg className="scene-fallback" viewBox="-44 -22 91 45" aria-label={`Conceptual ${floor} plan with staffing stations`} role="img">
        <rect x="-38.5" y="-15" width="29" height="30" rx=".3" fill={['B3','6F','7F'].includes(floor)?'#e8edef':'#e3f3fb'} stroke="#c8d1bd" strokeWidth=".3" />
        <rect x="-8.5" y="-15" width="27" height="13" fill={['B3','6F','7F'].includes(floor)?'#e8edef':'#e2edf6'} stroke="#c8d1bd" strokeWidth=".3" />
        <rect x="-8.5" y="2" width="27" height="13" fill="#e4f3f5" stroke="#c8d1bd" strokeWidth=".3" />
        <path d="M21 -14H28L41 -3V3L28 14H21V5H20V-5H21Z" fill={['B3','B1'].includes(floor)?'#e8edef':'#eee7f1'} stroke="#c8d1bd" strokeWidth=".3" />
        <path d="M-9 -14V14 M19.5 -14V14 M-37 0H25" fill="none" stroke="#d5dfc8" strokeWidth="1.8" />
        {(MODEL_ZONES[floor]||[]).map(zone=><g key={zone.name}><rect x={zone.x-zone.w/2} y={zone.z-zone.d/2} width={zone.w} height={zone.d} fill="#ffffff40" stroke="#c1cbb3" strokeWidth=".13"/>{props.showZoneLabels&&<text x={zone.x} y={zone.z} fill="#6f7e5e" fontSize=".7" textAnchor="middle">{zone.name}</text>}</g>)}
        {floorLocations.map(location => <g key={location.id}>
          {props.routes !== false && <polyline points={routeFor(location).map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke={colorOf(location.id)} strokeWidth=".12" strokeDasharray=".4 .25" />}
          {props.heatmap && <circle cx={location.x} cy={location.z} r={1.4 + stationCount(active, location.id) * .2} fill={colorOf(location.id)} opacity=".14" />}
          <circle cx={location.x} cy={location.z} r=".6" fill={colorOf(location.id)} stroke="white" strokeWidth=".22" />
          <text x={location.x} y={location.z - 1.25} textAnchor="middle" fill="#3c5141" fontSize=".75" fontFamily="sans-serif">{abbreviate(location)}</text>
          <text x={location.x} y={location.z + 1.5} textAnchor="middle" fill="#63715d" fontSize=".64" fontFamily="sans-serif">{stationCount(active, location.id)} assigned</text>
        </g>)}
        {active.flatMap(shift => {
          const location = floorLocations.find(l => l.id === shift.locationId); if (!location) return [];
          return shift.volunteerIds.map(id => { const position = routePosition(location, minute, id); return <circle key={`${shift.id}-${id}`} cx={position.x} cy={position.z} r=".24" fill={colorOf(location.id)} stroke="#fff" strokeWidth=".08" />; });
        })}
      </svg> : <>
        {!ready && <div className="scene-loading">Preparing your hospital model…</div>}
        {floor!=='all'&&floorLocations.map(location => <button key={location.id} ref={el => { labels.current[location.id] = el; }} className={`scene-label ${selectedLocation === location.id ? 'selected' : ''}`} style={{ borderColor: colorOf(location.id) }} onClick={() => onSelect?.(location.id)} aria-label={`${location.name}, ${stationCount(active, location.id)} assigned at selected time`} aria-pressed={selectedLocation === location.id}>
          <span className="scene-label-dot" style={{ background: colorOf(location.id) }} /><span>{abbreviate(location)}</span><b>{stationCount(active, location.id)}</b>
        </button>)}
        {floor==='all'&&HOSPITAL_FLOORS.map(definition=><button key={definition.id} ref={el=>{floorLabels.current[definition.id]=el;}} className="scene-floor-marker" onClick={()=>props.onFloorChange?.(definition.id)} aria-label={`Inspect ${definition.id} ${definition.title}`}><strong style={{color:definition.color}}>{definition.id}</strong><span>{definition.title}</span></button>)}
      </>}
    </div>
    <span className="scene-north" role="img" aria-label="Concept orientation"><span>↑</span>N<span className="scene-north-note">concept</span></span>
    <div className="scene-view-controls">
      <button type="button" title={fallback ? 'Show 3D model' : 'Show 2D plan'} aria-label={fallback ? 'Show 3D model' : 'Show 2D plan'} disabled={webglError} onClick={() => setPlanView(!planView)}><ScanLine size={16} /><span>{fallback ? '3D' : '2D'}</span></button>
      {!fallback && <><button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => api.current?.zoom(1.15)}><Plus size={17} /></button><button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => api.current?.zoom(.87)}><Minus size={17} /></button><button type="button" title="Reset view" aria-label="Reset view" onClick={() => api.current?.reset()}><RotateCcw size={15} /></button>{!compact&&<><button type="button" title="Download 3D model (GLB)" aria-label="Download 3D model (GLB)" onClick={()=>void api.current?.export()}><Download size={15}/></button><button type="button" title="Save view as PNG" aria-label="Save view as PNG" onClick={()=>api.current?.capture()}><Camera size={15}/></button></>}</>}
    </div>
    <div className="scene-caption"><span className="scene-caption-dot" />{webglError ? '2D fallback · WebGL unavailable' : fallback ? 'Schematic plan' : 'Interactive 3D model'}<span>•</span>Illustrative geometry</div>
    {!compact && <span className="scene-interaction-hint">{fallback ? 'Choose a station below to inspect assignments' : props.routeDrawing ? 'Click the floor to place route points' : hover ? `${hover} · Click to inspect · Double-click to focus` : 'Drag to orbit · Scroll to zoom · Click an object to inspect'}</span>}
    {exportState&&<span className="scene-export-status" role="status">{exportState}</span>}
  </div>;
}

export default HospitalScene;
