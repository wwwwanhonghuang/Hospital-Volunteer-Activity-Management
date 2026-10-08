// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useState } from 'react';
import { saveEntity, deleteEntity } from '../api';
import type { PageProps, SceneScenario } from '../types';
import { validateScenario, scenarioSchema } from '../../shared/spatial-scenario.mjs';

export type ScenarioDraft = Omit<SceneScenario,'id'|'version'> & {id?:string;version?:number};
const blank = (): ScenarioDraft => ({name:'Untitled spatial study',description:'',objects:{},additions:[],routes:[]});
function fingerprint(value: unknown): string {
  if(Array.isArray(value))return `[${value.map(fingerprint).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${fingerprint(item)}`).join(',')}}`;
  return JSON.stringify(value)??'null';
}
export function downloadScenario(value: ScenarioDraft) {
  const {name,description,objects,additions,routes}=value;
  const blob=new Blob([JSON.stringify({format:'shuori-scene',version:1,scenario:{name,description,objects,additions,routes}},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'scenario'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function useSceneScenario({data,user,notify,refresh}:PageProps) {
  const storageKey=`shuori-scene-draft-${user.id}`;
  const legacyStorageKey=`komorebi-scene-draft-${user.id}`;
  const [initial]=useState(()=>{try{const cached=JSON.parse(sessionStorage.getItem(storageKey)||sessionStorage.getItem(legacyStorageKey)||'null');if(cached?.draft&&typeof cached.saved==='string'&&validateScenario(cached.draft,data).valid){const content=scenarioSchema.parse(cached.draft);return {draft:{...content,...(typeof cached.draft.createdAt==='string'?{createdAt:cached.draft.createdAt}:{}),...(typeof cached.draft.updatedAt==='string'?{updatedAt:cached.draft.updatedAt}:{}),...(typeof cached.draft.id==='string'&&Number.isInteger(cached.draft.version)?{id:cached.draft.id,version:cached.draft.version}: {})},saved:fingerprint(JSON.parse(cached.saved))};}}catch{/* Start with an empty, validated layout. */}return {draft:blank(),saved:fingerprint(blank())};});
  const [draft,setDraft]=useState<ScenarioDraft>(initial.draft);
  const [saved,setSaved]=useState(initial.saved);
  const [past,setPast]=useState<ScenarioDraft[]>([]);const [future,setFuture]=useState<ScenarioDraft[]>([]);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const dirty=useMemo(()=>fingerprint(draft)!==saved,[draft,saved]);
  useEffect(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify({draft,saved}));}catch{/* Server save remains available if browser storage is disabled. */}},[storageKey,draft,saved]);
  useEffect(()=>{if(!dirty)return;const leave=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[dirty]);
  function change(next:ScenarioDraft|((value:ScenarioDraft)=>ScenarioDraft)){
    if(user.role==='viewer'||busy)return;
    const value=typeof next==='function'?next(draft):next;
    if(fingerprint(value)===fingerprint(draft))return;
    setPast(previous=>[...previous.slice(-39),draft]);setFuture([]);setDraft(value);setError('');
  }
  function load(value?:SceneScenario){const next=value?structuredClone(value):blank();setDraft(next);setSaved(fingerprint(next));setPast([]);setFuture([]);setError('');}
  async function save(copy=false){
    if(busy||user.role==='viewer')return;
    const checked=validateScenario(draft,data);if(!checked.valid){setError(checked.errors.join(' '));return;}
    setBusy(true);setError('');
    try{const {id,version,createdAt,updatedAt,...content}=draft;void createdAt;void updatedAt;const value=await saveEntity<ScenarioDraft>('scenarios',copy?content:{...content,...(id?{id,version}: {})});setDraft(value);setSaved(fingerprint(value));setPast([]);setFuture([]);await refresh();notify('Spatial scenario saved.');}
    catch(e){setError(e instanceof Error?e.message:'Could not save scenario.');}finally{setBusy(false);}
  }
  async function remove(){if(!draft.id||!draft.version||busy||user.role==='viewer')return;setBusy(true);try{await deleteEntity('scenarios',{id:draft.id,version:draft.version});load();await refresh();notify('Scenario deleted.');}catch(e){setError(e instanceof Error?e.message:'Could not delete scenario.');}finally{setBusy(false);}}
  async function importFile(file:File){
    if(busy||user.role==='viewer')return;
    try{if(file.size>1_000_000)throw new Error('Choose a scenario JSON file smaller than 1 MB.');const value=JSON.parse(await file.text());if(!['shuori-scene','komorebi-scene'].includes(value.format)||value.version!==1)throw new Error('This file is not a supported SHUORI scenario.');const checked=validateScenario(value.scenario,data);if(!checked.valid)throw new Error(checked.errors.join(' '));change(scenarioSchema.parse(value.scenario));notify('Scenario imported as an unsaved copy.');}catch(e){setError(e instanceof Error?e.message:'Could not read scenario.');}
  }
  const undo=()=>{if(!past.length||busy)return;setFuture([draft,...future]);setDraft(past[past.length-1]);setPast(past.slice(0,-1));};
  const redo=()=>{if(!future.length||busy)return;setPast([...past,draft]);setDraft(future[0]);setFuture(future.slice(1));};
  return {draft,change,load,save,remove,importFile,undo,redo,canUndo:!!past.length,canRedo:!!future.length,dirty,busy,error};
}
