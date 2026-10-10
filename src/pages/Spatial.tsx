// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClientId } from '../../shared/client-id.mjs';
import { ArrowRight, Box, CalendarDays, Check, Clock3, ExternalLink, Info, Layers3, MapPin, Pause, Play, RotateCcw, Users } from 'lucide-react';
import type { PageProps } from '../types';
import HospitalScene, { shiftsAt, stationColors, stationCount } from '../components/HospitalScene';
import { HOSPITAL_FLOORS } from '../components/hospitalModel';
import { ASSET_CATALOG, type SpatialObject } from '../components/spatialTypes';
import { ObjectBrowser, ObjectInspector, AssetPalette, type EditMode, type TransformPatch } from '../components/SpatialStudioPanel';
import { useSceneScenario, downloadScenario } from '../components/useSceneScenario';
import { Modal } from '../components/UI';
import ExcelExportButton from '../components/ExcelExportButton';
import '../spatial.css';
import '../studio-workspace.css';

const formatMinute = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`;
const timeSpan = (start: string, end: string) => `${start}–${end}`;

export default function Spatial(props: PageProps) {
  const {data,date,navigate,user,notify}=props;
  const scenario=useSceneScenario(props);
  const [objects,setObjects]=useState<SpatialObject[]>([]);
  const [selectedObjectId,setSelectedObjectId]=useState('');
  const [editMode,setEditMode]=useState<EditMode>('inspect');
  const [studioTab,setStudioTab]=useState('objects');
  const [focusRequest,setFocusRequest]=useState<{id:string;sequence:number}>();
  const [showPeople,setShowPeople]=useState(true),[showStations,setShowStations]=useState(false),[topView,setTopView]=useState(false);
  const [pendingAction,setPendingAction]=useState<string|null>(null);
  const importInput=useRef<HTMLInputElement>(null);
  const [routeTarget,setRouteTarget]=useState<{shiftId:string;volunteerId:string;floor:string}|null>(null);
  const [routeDraft,setRouteDraft]=useState<{x:number;z:number}[]>([]);
  const [pointX,setPointX]=useState(0),[pointZ,setPointZ]=useState(0);
  const [selectedDate, setSelectedDate] = useState(date);
  const [floor, setFloor] = useState('all');
  const [minute, setMinute] = useState(600);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [routes, setRoutes] = useState(true);
  const [heatmap, setHeatmap] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('reception');
  const [resetKey, setResetKey] = useState(0);
  const [explode, setExplode] = useState(9);
  const [showSkin, setShowSkin] = useState(true);
  const [showZoneLabels, setShowZoneLabels] = useState(true);
  const shifts = useMemo(() => data.shifts.filter(s => s.date === selectedDate), [data.shifts, selectedDate]);
  const active = shiftsAt(shifts, minute);
  const locations = data.locations.filter(l => floor==='all'||l.floor === floor);
  const floorDefinition = HOSPITAL_FLOORS.find(f=>f.id===floor);
  const floorIds = new Set(locations.map(l => l.id));
  const floorActive = active.filter(s => floorIds.has(s.locationId));
  const assigned = new Set(floorActive.flatMap(s => s.volunteerIds)).size;
  const required = floorActive.reduce((sum, s) => sum + s.requiredCount, 0);
  const gaps = floorActive.reduce((sum, s) => sum + Math.max(0, s.requiredCount - new Set(s.volunteerIds).size), 0);
  const selected = locations.find(l => l.id === selectedLocation) || locations[0];
  const stationShifts = active.filter(s => s.locationId === selected?.id);
  const stationVolunteers = new Set(stationShifts.flatMap(s => s.volunteerIds));
  const selectedObject=objects.find(object=>object.id===selectedObjectId)||null;
  const canEdit=user.role!=='viewer'&&!scenario.busy;
  const hiddenIds=new Set(Object.entries(scenario.draft.objects).filter(([,value])=>value.hidden).map(([id])=>id));
  const people=floorActive.flatMap(shift=>shift.volunteerIds.map(volunteerId=>({shift,volunteerId,volunteer:data.volunteers.find(v=>v.id===volunteerId),location:data.locations.find(l=>l.id===shift.locationId)!})));
  function selectObject(id:string|null){setSelectedObjectId(id||'');setEditMode('inspect');if(id?.startsWith('person:'))setStudioTab('people');else setStudioTab('objects');}
  function focusObject(id:string){const item=objects.find(object=>object.id===id);if(item&&floor!==item.floor){setFloor(item.floor);setRouteTarget(null);}setSelectedObjectId(id);setFocusRequest({id,sequence:Date.now()});}
  function transformObject(id:string,patch:TransformPatch){const object=objects.find(value=>value.id===id);if(!object?.editable||!canEdit)return;scenario.change(value=>({...value,objects:{...value.objects,[id]:{...(value.objects[id]??{...object.position,rotation:object.rotation,hidden:false}),...patch}}}));}
  function resetObject(){if(!selectedObject)return;scenario.change(value=>{const next={...value.objects};delete next[selectedObject.id];return {...value,objects:next};});}
  function addAsset(kind:string){if(floor==='all'||!canEdit)return;if(scenario.draft.additions.length>=300){notify('A scenario supports up to 300 added objects.','error');return;}const asset=ASSET_CATALOG.find(value=>value.kind===kind)!;const id=`added-${createClientId()}`;scenario.change(value=>({...value,additions:[...value.additions,{id,kind,floor,x:-9,y:.34,z:0,rotation:0,name:asset.name}]}));setSelectedObjectId(id);setStudioTab('objects');setEditMode('translate');setFocusRequest({id,sequence:Date.now()});}
  function removeObject(){if(!selectedObject)return;scenario.change(value=>{const next={...value.objects};delete next[selectedObject.id];return {...value,objects:next,additions:value.additions.filter(item=>item.id!==selectedObject.id)};});setSelectedObjectId('');}
  function switchScenario(id:string){if(scenario.dirty){setPendingAction(id||'new');return;}scenario.load(data.scenarios.find(value=>value.id===id));setSelectedObjectId('');setRouteTarget(null);}
  function startRoute(shiftId:string,volunteerId:string,routeFloor:string){setPlaying(false);setFloor(routeFloor);setEditMode('inspect');setRouteTarget({shiftId,volunteerId,floor:routeFloor});setRouteDraft(scenario.draft.routes.find(value=>value.shiftId===shiftId&&value.volunteerId===volunteerId)?.points||[]);setTopView(true);setResetKey(value=>value+1);}
  function finishRoute(){if(!routeTarget||routeDraft.length<2)return;if(!routeDraft.some(point=>point.x!==routeDraft[0].x||point.z!==routeDraft[0].z)){notify('Place at least two different route points.','error');return;}scenario.change(value=>({...value,routes:[...value.routes.filter(route=>route.shiftId!==routeTarget.shiftId||route.volunteerId!==routeTarget.volunteerId),{...routeTarget,id:`route-${createClientId()}`,points:routeDraft}]}));setRouteTarget(null);setRouteDraft([]);notify('Rehearsal route applied. Save the scenario to share it.');}

  useEffect(() => { setSelectedDate(date);setRouteTarget(null); }, [date]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(); const delta = Math.min((now - last) / 1000, .5) * speed; last = now;
      setMinute(value => Math.min(1080, value + delta));
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, speed]);
  useEffect(() => { if (minute >= 1080) setPlaying(false); }, [minute]);

  const selectFloor = (value: string) => { setFloor(value);setSelectedObjectId('');setRouteTarget(null);setEditMode('inspect'); setSelectedLocation(data.locations.find(l => l.floor === value)?.id || ''); };
  return <div className="spatial-page">
    <div className="spatial-heading">
      <div><p className="spatial-eyebrow">SPACE & MOVEMENT · SPATIAL STUDIO</p><h1>Hospital in perspective<span>.</span></h1><p>Explore each detail. Arrange a space. Rehearse the day.</p></div>
      <button className="spatial-button" onClick={() => navigate('schedule')}><CalendarDays size={16} /> Open schedule <ArrowRight size={16} /></button>
    </div>

    <div className="studio-scenario-bar" role="group" aria-label="Scenario workspace">
      <div className="studio-scenario-name"><label htmlFor="scenario-name">SPATIAL SCENARIO <span>{scenario.dirty?'Unsaved changes':scenario.draft.id?'Saved to workspace':'New study'}</span></label><input id="scenario-name" aria-label="Scenario name" value={scenario.draft.name} maxLength={160} disabled={!canEdit} onChange={event=>scenario.change(value=>({...value,name:event.target.value}))}/></div>
      <select aria-label="Load saved scenario" value={scenario.draft.id||''} disabled={scenario.busy} onChange={event=>switchScenario(event.target.value)}><option value="">New study</option>{data.scenarios.map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select>
      <div className="studio-scenario-actions"><button className="studio-button" aria-label="Undo scene change" disabled={!canEdit||!scenario.canUndo} onClick={scenario.undo}>Undo</button><button className="studio-button" aria-label="Redo scene change" disabled={!canEdit||!scenario.canRedo} onClick={scenario.redo}>Redo</button><button className="studio-button" disabled={!canEdit} onClick={()=>switchScenario('')}>New</button><button className="studio-button studio-primary" disabled={!canEdit||!scenario.draft.name.trim()} onClick={()=>void scenario.save()}>{scenario.busy?'Saving…':'Save scenario'}</button></div>
      <details className="studio-file-menu"><summary>Scenario files</summary><div><button onClick={()=>downloadScenario(scenario.draft)}>Export scenario JSON</button><ExcelExportButton request={{kind:'scenarios',ids:data.scenarios.map(value=>value.id)}} label="Saved scenarios Excel" scope={`${data.scenarios.length} saved studies | excludes unsaved edits`} notify={notify} className="studio-button"/><button disabled={!canEdit} onClick={()=>importInput.current?.click()}>Import scenario JSON</button><button disabled={!canEdit} onClick={()=>void scenario.save(true)}>Save as copy</button><button disabled={!canEdit||!scenario.draft.id} onClick={()=>setPendingAction('delete')}>Delete saved scenario</button></div></details>
      <input ref={importInput} type="file" accept=".json,application/json" aria-label="Import scenario file" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void scenario.importFile(file);event.target.value='';}}/>
    </div>
    {scenario.error&&<div className="op-error" role="alert">{scenario.error}</div>}
    <div className="spatial-workspace studio-workspace">
      <section className="spatial-model-panel" aria-label="Spatial planning model">
        <div className="spatial-model-top"><div className="spatial-floor-tabs" role="group" aria-label="Choose hospital floor">
          <button className={floor==='all'?'active':''} aria-pressed={floor==='all'} onClick={()=>selectFloor('all')}><Layers3 size={15}/><strong>Building</strong></button>
          {HOSPITAL_FLOORS.map(value => <button key={value.id} className={floor === value.id ? 'active' : ''} aria-pressed={floor === value.id} onClick={() => selectFloor(value.id)} title={value.title}><strong>{value.id}</strong></button>)}
        </div><span className="spatial-simulation-badge"><span />Planning simulation</span></div>
        <div className="spatial-model-settings"><span>{floor==='all'?'Exploded building study':`${floor} · ${floorDefinition?.title}`}</span>{floor==='all'?<label>Floor separation<input type="range" min="4" max="14" value={explode} onChange={e=>setExplode(Number(e.target.value))} aria-label="Floor separation"/><output>{explode}</output></label>:<button onClick={()=>setShowZoneLabels(!showZoneLabels)} aria-pressed={showZoneLabels}>{showZoneLabels?'Hide':'Show'} zone labels</button>}<button onClick={()=>setShowSkin(!showSkin)} aria-pressed={showSkin}>{showSkin?'Hide':'Show'} facade</button></div>
        <div className="studio-viewport-tools"><div><button className="studio-button" aria-pressed={topView} onClick={()=>setTopView(!topView)}>{topView?'Isometric view':'Top view'}</button><button className="studio-button" aria-pressed={showPeople} onClick={()=>setShowPeople(!showPeople)}>People</button><button className="studio-button" aria-pressed={showStations} onClick={()=>setShowStations(!showStations)}>Station labels</button></div><span>{objects.length} objects · {floor==='all'?'Choose a floor to arrange objects':'Move: 0.25 units · Rotate: 15°'}</span></div>
        {routeTarget&&<div className="studio-route-banner" role="status">Drawing a rehearsal route · {routeDraft.length}/50 points. Click the floor or add coordinates in People.<button onClick={()=>{setRouteTarget(null);setRouteDraft([]);}}>Cancel drawing</button></div>}
        <HospitalScene locations={data.locations} shifts={shifts} volunteers={data.volunteers} minute={minute} floor={floor} playing={playing} heatmap={heatmap} routes={routes} selectedLocation={selected?.id} onSelect={id=>{setSelectedLocation(id);setStudioTab('guide');}} resetKey={resetKey} explode={explode} showSkin={showSkin} showZoneLabels={showZoneLabels} onFloorChange={selectFloor}
          scenario={scenario.draft} selectedObjectId={selectedObjectId} onObjectSelect={selectObject} onObjectsChange={setObjects} onObjectTransform={transformObject} editMode={canEdit?editMode:'inspect'} focusRequest={focusRequest} objectDetail={selectedObject||undefined} showPeople={showPeople} showStations={showStations} topView={topView} routeDrawing={!!routeTarget} routeDraft={routeDraft} onRoutePoint={point=>setRouteDraft(value=>value.length<50?[...value,point]:value)} />
        <div className="spatial-model-bottom"><div className="spatial-layer-toggles"><button className={routes ? 'active' : ''} aria-pressed={routes} onClick={() => setRoutes(!routes)}><span className="spatial-checkbox">{routes && <Check size={11} />}</span>Concept routes</button><button className={heatmap ? 'active' : ''} aria-pressed={heatmap} onClick={() => setHeatmap(!heatmap)}><span className="spatial-checkbox">{heatmap && <Check size={11} />}</span>Assignment density</button></div><span><Users size={14} />{assigned} scheduled {floor==='all'?'across the building':'on this floor'}</span></div>

        <div className="spatial-playback">
          <div className="spatial-playback-top"><div><span className="spatial-small-label">REHEARSAL TIME</span><strong>{formatMinute(minute)}<small>JST</small></strong></div><div className="spatial-playback-actions"><label className="spatial-date"><CalendarDays size={15} /><input type="date" value={selectedDate} onChange={e => e.target.value && setSelectedDate(e.target.value)} aria-label="Simulation date" /></label><label className="spatial-speed"><span>Speed</span><select value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Simulation speed"><option value={1}>1 min / sec</option><option value={10}>10 min / sec</option><option value={30}>30 min / sec</option></select></label><button className={`spatial-play ${playing ? 'playing' : ''}`} onClick={() => { if (minute >= 1080) setMinute(480); setPlaying(!playing); }} aria-label={playing ? 'Pause simulation' : 'Play simulation'}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}<span>{playing ? 'Pause' : 'Play'}</span></button><button className="spatial-reset" aria-label="Reset simulation" title="Reset simulation" onClick={() => { setPlaying(false); setMinute(600); setResetKey(value => value + 1); }}><RotateCcw size={17} /></button></div></div>
          <input className="spatial-timeline" type="range" min={480} max={1080} step={1} value={Math.floor(minute)} onChange={e => setMinute(Number(e.target.value))} aria-label="Simulation time" aria-valuetext={`${formatMinute(minute)} Japan Standard Time`} style={{ background: `linear-gradient(to right, #1783a4 ${(minute - 480) / 6}%, #dcebf3 ${(minute - 480) / 6}%)` }} />
          <div className="spatial-time-ticks">{['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'].map(time => <span key={time}>{time}</span>)}</div>
        </div>
      </section>

      <aside className="spatial-inspector" aria-label="Floor and station details">
        <div className="studio-tabs" role="group" aria-label="Spatial studio panels">{[['objects','Objects'],['assets','Assets'],['people','People'],['guide','Guide']].map(([id,label])=><button key={id} aria-pressed={studioTab===id} onClick={()=>setStudioTab(id)}>{label}</button>)}</div>
        {studioTab==='objects'&&<><ObjectInspector object={selectedObject} hidden={hiddenIds.has(selectedObjectId)} onFocus={()=>focusObject(selectedObjectId)} onChange={patch=>transformObject(selectedObjectId,patch)} onToggleHidden={()=>{if(selectedObject)scenario.change(value=>({...value,objects:{...value.objects,[selectedObjectId]:{...(value.objects[selectedObjectId]??{...selectedObject.position,rotation:selectedObject.rotation}),hidden:!hiddenIds.has(selectedObjectId)}}}));}} onReset={resetObject} onDelete={scenario.draft.additions.some(value=>value.id===selectedObjectId)?removeObject:undefined} canEdit={canEdit&&floor!=='all'} mode={editMode} onMode={setEditMode}/><ObjectBrowser objects={objects} selectedId={selectedObjectId} onSelect={selectObject} onFocus={focusObject} hiddenIds={hiddenIds} floor={floor}/></>}
        {studioTab==='assets'&&<AssetPalette onAdd={addAsset} disabled={!canEdit||floor==='all'}/>}
        {studioTab==='people'&&<div className="studio-people-panel"><h2>People in motion</h2><p>Figures come from active assignments at {formatMinute(minute)}. Select a person to inspect their shift or rehearse a custom route.</p><div className="studio-floor-summary"><strong>{assigned}</strong> assigned · <strong>{gaps}</strong> unfilled positions</div>
          {routeTarget&&<section className="studio-route-editor" aria-label="Rehearsal route editor"><h3>Draw a floor route</h3><p>{data.volunteers.find(value=>value.id===routeTarget.volunteerId)?.name} · {routeTarget.floor}</p><p>Click points in the model. Routes are straight segments with no obstacle or access checks.</p><div className="studio-route-coordinates"><label>Point X<input type="number" aria-label="Route point X" value={pointX} min={-45} max={45} step={.25} onChange={event=>setPointX(Number(event.target.value))}/></label><label>Point Z<input type="number" aria-label="Route point Z" value={pointZ} min={-22} max={22} step={.25} onChange={event=>setPointZ(Number(event.target.value))}/></label></div><button className="studio-button" disabled={routeDraft.length>=50||!Number.isFinite(pointX)||!Number.isFinite(pointZ)||Math.abs(pointX)>45||Math.abs(pointZ)>22} onClick={()=>setRouteDraft(value=>[...value,{x:pointX,z:pointZ}])}>Add route point</button><ol className="studio-route-points">{routeDraft.map((point,index)=><li key={index}><span>{index+1}</span> X {point.x} · Z {point.z}<button aria-label={`Remove route point ${index+1}`} onClick={()=>setRouteDraft(value=>value.filter((_,i)=>i!==index))}>×</button></li>)}</ol><div className="studio-action-row"><button className="studio-button" onClick={()=>setRouteDraft([])}>Clear points</button><button className="studio-button studio-primary" disabled={routeDraft.length<2} onClick={finishRoute}>Apply route</button></div></section>}
          {!people.length&&<p className="studio-empty">No active assignments on this floor at this time. Adjust the date, time or floor.</p>}{people.map(({shift,volunteerId,volunteer,location})=>{const id=`person:${shift.id}:${volunteerId}`;const route=scenario.draft.routes.find(value=>value.shiftId===shift.id&&value.volunteerId===volunteerId);return <section key={id} className={`studio-person-card ${selectedObjectId===id?'selected':''}`}><button className="studio-person-select" onClick={()=>{selectObject(id);focusObject(id);}}><span>{volunteer?.name.split(' ').map(part=>part[0]).join('').slice(0,2)}</span><strong>{volunteer?.name||'Volunteer'}<small>{location.floor} · {location.name}</small></strong></button><p>{shift.title}<br/>{timeSpan(shift.start,shift.end)} · {shift.status}</p><div className="studio-action-row"><button className="studio-button" disabled={!canEdit} onClick={()=>startRoute(shift.id,volunteerId,location.floor)}>{route?'Edit rehearsal route':'Draw rehearsal route'}</button>{route&&<button className="studio-button" disabled={!canEdit} onClick={()=>scenario.change(value=>({...value,routes:value.routes.filter(item=>item.id!==route.id)}))}>Reset route</button>}</div>{route&&<small className="studio-route-saved">Custom route · {route.points.length} points</small>}</section>;})}<div className="studio-model-note"><Info size={14}/><span>One illustrative round trip takes 24 simulation minutes. This is not measured walking speed or live tracking.</span></div><button className="studio-button" onClick={()=>navigate('schedule')}>Manage shift assignments <ArrowRight size={14}/></button></div>}
        {studioTab==='guide'&&<>
        <div className="spatial-inspector-title"><span className="spatial-small-label">{floor==='all'?'BUILDING SNAPSHOT':`${floor} SNAPSHOT`}</span><Box size={18} /></div>
        <h2>{floor==='all'?'Every floor, connected.':floor === '1F' ? 'A welcoming first step.' : floor==='6F'?'A place to read & recharge.':floorDefinition?.title}</h2>
        <p className="spatial-muted">{floor==='all'?'Explore the public guide’s complete four-wing footprint across eight published levels.':floorDefinition?.summary}</p>
        <div className="spatial-floor-stats"><div><strong>{assigned}<small>/{required}</small></strong><span>Scheduled / needed</span></div><div><strong className={gaps ? 'spatial-amber' : ''}>{gaps}</strong><span>Unfilled positions</span></div></div>
        {floor==='all'&&<div className="spatial-floor-directory">{[...HOSPITAL_FLOORS].reverse().map(definition=><button key={definition.id} onClick={()=>selectFloor(definition.id)}><strong style={{color:definition.color}}>{definition.id}</strong><span>{definition.title}<small>{definition.zones.length} guide reference zones</small></span><ArrowRight size={13}/></button>)}<p>5F and B2 are not published in this floor guide and are omitted. Spacing in the stack is illustrative.</p></div>}
        {floor!=='all'&&<details className="spatial-zone-directory" key={floor} open={!locations.length}><summary className="spatial-list-title">Guide reference zones <span>{floorDefinition?.zones.length}</span></summary>{floorDefinition?.zones.map(zone=><span key={zone}><span/>{zone}</span>)}<a href={floorDefinition?.source} target="_blank" rel="noreferrer">View this floor’s source <ExternalLink size={11}/></a><small>Service names follow the published guide. Room boundaries and furnishings are illustrative.</small></details>}
        {floor!=='all'&&<div className="spatial-station-list"><div className="spatial-list-title">Volunteer stations <span>{locations.length}</span></div>{locations.map(location => {
          const count = stationCount(active, location.id);
          const needed = active.filter(s => s.locationId === location.id).reduce((sum, s) => sum + s.requiredCount, 0);
          return <button key={location.id} className={`spatial-station ${selected?.id === location.id ? 'selected' : ''}`} onClick={() => setSelectedLocation(location.id)} aria-pressed={selected?.id === location.id}><span className="spatial-station-dot" style={{ background: stationColors[location.id] || '#56899e' }} /><span>{location.name}<small>{needed ? `${count} assigned · ${needed} needed` : 'No shift at this time'}</small></span><ArrowRight size={15} /></button>;
        })}{!locations.length&&<p className="spatial-empty">No volunteer service stations are configured on this floor. Clinical zones are shown for orientation only.</p>}</div>}
        {selected && floor!=='all'&&<div className="spatial-station-detail"><div className="spatial-detail-heading"><MapPin size={15} /><span>{selected.name}</span></div><p>{selected.description}</p><span className="spatial-source-chip">{selected.source === 'official' ? 'Facility reference verified' : 'Concept station'}</span><div className="spatial-assignments"><span className="spatial-small-label">SCHEDULED AT {formatMinute(minute)}</span>{stationVolunteers.size ? [...stationVolunteers].map(id => { const volunteer = data.volunteers.find(v => v.id === id); return <div className="spatial-person" key={id}><span>{volunteer?.name.split(' ').map(s => s[0]).join('').slice(0, 2) || '?'}</span><div>{volunteer?.name || 'Unknown volunteer'}<small>{stationShifts.filter(s => s.volunteerIds.includes(id)).map(s => timeSpan(s.start, s.end)).join(' · ')}</small></div></div>; }) : <p className="spatial-empty">No volunteers scheduled for this station at {formatMinute(minute)}.</p>}</div>{stationShifts.map(shift => <div className="spatial-shift-note" key={shift.id}><Clock3 size={13} /><span>{shift.title}<small>{timeSpan(shift.start, shift.end)} · {shift.status}</small></span></div>)}</div>}
        </>}
      </aside>
    </div>

    <div className="spatial-building-legend"><span><i style={{background:'#e3f3fb'}}/>Outpatient clinic</span><span><i style={{background:'#e2edf6'}}/>Central Clinical 1</span><span><i style={{background:'#e4f3f5'}}/>Central Clinical 2</span><span><i style={{background:'#eee7f1'}}/>Ward A</span><span><i style={{background:'#dde7ed'}}/>Unspecified / roof footprint</span></div>
    <div className="spatial-context-note"><Info size={18} /><div><strong>An independently reconstructed demo model.</strong><p>This example uses an external hospital's public floor maps solely as a modeling reference. SHUORI has no hospital or organizational affiliation. Source-derived building relationships and service names cover eight published levels. Geometry, room subdivisions, furniture, orientation and connecting routes are original schematic illustrations in arbitrary units. Counts come from scheduled assignments; moving figures are rehearsals, not live tracking or measured journeys. Assignment density represents volunteers, not patient occupancy. Download the current model as GLB or save a PNG using the model toolbar.</p></div><a href="https://www.h.u-tokyo.ac.jp/english/international-patients/floor-guide/index.html" target="_blank" rel="noreferrer">Public source floor maps <ExternalLink size={13} /></a></div>
    {floor === '6F' && <p className="spatial-library-note">The demo library is placed on 6F of Central Clinical Building 2 in the example model. The example source described Monday, Wednesday and Friday, 10:00–14:30 when reviewed. See the <a href="https://www.h.u-tokyo.ac.jp/patient/library/" target="_blank" rel="noreferrer">public source library page</a> for provenance; this demo does not describe your deployment's services.</p>}
    {pendingAction&&<Modal title={pendingAction==='delete'?'Delete saved scenario?':'Leave this spatial study?'} onClose={()=>setPendingAction(null)}><p>{pendingAction==='delete'?'This deletes the saved layout and routes from the shared workspace. The original hospital model is always available.':'You have unsaved changes. Save this study first, or discard these changes to open another study.'}</p><div className="form-actions"><button className="button button-secondary" onClick={()=>setPendingAction(null)}>Keep editing</button><button className="button button-primary" onClick={()=>{if(pendingAction==='delete')void scenario.remove();else scenario.load(data.scenarios.find(value=>value.id===pendingAction));setSelectedObjectId('');setRouteTarget(null);setPendingAction(null);}}>{pendingAction==='delete'?'Delete scenario':'Discard and continue'}</button></div></Modal>}
  </div>;
}
