// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { restoreBackup, exportBackup } from '../server/backup.mjs';
import { seedState } from '../server/seed.mjs';

async function serverFor(t,options={}) {
  const app=createApp({dbPath:':memory:',mode:'demo',demoDate:'2026-10-08',...options});
  const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});
  const url=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));app.locals.close();});
  async function client(role='admin') {
    const login=await fetch(`${url}/api/demo-login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:role})});
    const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
    return {async request(path,{method='GET',body,raw,csrf=true,headers={}}={}){const response=await fetch(`${url}/api${path}`,{method,headers:{Cookie:cookie,'Content-Type':raw?'application/octet-stream':'application/json',...(csrf?{'X-CSRF-Token':session.csrfToken}:{}),...headers},body:raw??(body===undefined?undefined:JSON.stringify(body))});const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{data=bytes.toString();}return {status:response.status,data,bytes,headers:response.headers};}};
  }
  return {app,url,client};
}
const field={scope:'volunteers',label:'First aid qualification',type:'select',options:['None','Basic','Advanced'],required:false,active:true,order:10};
const event={title:'Planning discussion',typeId:'event-type-meeting',date:'2026-10-12',endDate:'2026-10-12',start:'09:00',end:'10:00',status:'draft',description:'A test meeting',owner:'Coordinator',locationId:'coordination',projectId:'project-welcome',volunteerIds:['vol-1'],shiftIds:[],resourceIds:['resource-1'],modules:['meeting','attendance'],meeting:{provider:'zoom',url:'https://zoom.us/j/123456789',agenda:'Confirm arrangements.'},attendance:[{volunteerId:'vol-1',status:'invited',notes:''}]};

test('extensible volunteer fields validate types, required values and safe schema evolution',async t=>{
  const server=await serverFor(t),admin=await server.client(),viewer=await server.client('viewer');
  assert.equal((await viewer.request('/fieldDefinitions',{method:'POST',body:field})).status,403);
  const created=await admin.request('/fieldDefinitions',{method:'POST',body:field});assert.equal(created.status,201);const id=created.data.id;
  let volunteer=(await admin.request('/state')).data.volunteers[0];
  assert.equal((await admin.request(`/volunteers/${volunteer.id}`,{method:'PUT',body:{version:volunteer.version,customFields:{...volunteer.customFields,[id]:'Invalid choice'}}})).status,400);
  const update=await admin.request(`/volunteers/${volunteer.id}`,{method:'PUT',body:{version:volunteer.version,tags:['Bilingual','Weekend'],contactPreference:'phone',emergencyContact:{name:'Synthetic Contact',relationship:'Friend',phone:'000-0000'},customFields:{...volunteer.customFields,[id]:'Basic'}}});assert.equal(update.status,200);volunteer=update.data;assert.equal(volunteer.emergencyContact.relationship,'Friend');
  assert.equal((await admin.request(`/fieldDefinitions/${id}`,{method:'PUT',body:{version:1,type:'text',options:[]}})).status,409);
  assert.equal((await admin.request(`/fieldDefinitions/${id}`,{method:'PUT',body:{version:1,scope:'events'}})).status,409);
  assert.equal((await admin.request(`/fieldDefinitions/${id}`,{method:'PUT',body:{version:1,options:['None','Advanced']}})).status,409);
  assert.equal((await admin.request(`/fieldDefinitions/${id}`,{method:'DELETE',body:{version:1}})).status,409);
  assert.equal((await admin.request(`/fieldDefinitions/${id}`,{method:'PUT',body:{version:1,active:false}})).status,200);
  assert.equal((await admin.request(`/volunteers/${volunteer.id}`,{method:'PUT',body:{version:volunteer.version,notes:'Archived fields remain intact.'}})).status,200);
  assert.equal((await admin.request('/state')).data.volunteers[0].customFields[id],'Basic');
  const required=(await admin.request('/fieldDefinitions',{method:'POST',body:{...field,label:'Review date',type:'date',options:[],required:true}})).data;
  volunteer=(await admin.request('/state')).data.volunteers[0];
  assert.equal((await admin.request(`/volunteers/${volunteer.id}`,{method:'PUT',body:{version:volunteer.version,notes:'Missing required'}})).status,400);
  assert.equal((await admin.request(`/volunteers/${volunteer.id}`,{method:'PUT',body:{version:volunteer.version,customFields:{...volunteer.customFields,[required.id]:'2026-02-30'}}})).status,400);
  assert.equal((await admin.request(`/volunteers/${volunteer.id}`,{method:'PUT',body:{version:volunteer.version,customFields:{...volunteer.customFields,[required.id]:'2026-10-12'}}})).status,200);
  const state=(await admin.request('/state')).data;assert.equal(state.volunteers[0].customFields[required.id],'2026-10-12');
});

test('events link modules, timelines and operations while protecting references and stale edits',async t=>{
  const server=await serverFor(t),admin=await server.client();
  for(const url of ['javascript:alert(1)','http://zoom.us/j/123','https://user:password@zoom.us/','https://zoom.us/%0aheader'])assert.equal((await admin.request('/events',{method:'POST',body:{...event,meeting:{provider:'zoom',url}}})).status,400);
  assert.equal((await admin.request('/events',{method:'POST',body:{...event,end:'08:00'}})).status,400);
  assert.equal((await admin.request('/events',{method:'POST',body:{...event,resourceIds:['missing']}})).status,400);
  assert.equal((await admin.request('/events',{method:'POST',body:{...event,attendance:[{volunteerId:'vol-2',status:'invited'}]}})).status,400);
  const result=await admin.request('/events',{method:'POST',body:{...event,endDate:'2026-10-13',end:'08:00'}});assert.equal(result.status,201);let saved=result.data;
  const entry=await admin.request('/entries',{method:'POST',body:{volunteerId:'vol-1',eventId:saved.id,title:'Follow-up',category:'Mentoring',date:'2026-10-08',dueDate:'2026-10-13',status:'open',body:'Arrange a follow-up.'}});assert.equal(entry.status,201);
  assert.equal((await admin.request(`/events/${saved.id}`,{method:'DELETE',body:{version:1}})).status,409);
  assert.equal((await admin.request('/resources/resource-1',{method:'DELETE',body:{version:1}})).status,409);
  assert.equal((await admin.request('/eventTypes/event-type-meeting',{method:'DELETE',body:{version:1}})).status,409);
  const updated=await admin.request(`/events/${saved.id}`,{method:'PUT',body:{version:1,status:'confirmed',attendance:[{volunteerId:'vol-1',status:'confirmed',notes:'Joining remotely'}]}});assert.equal(updated.status,200);saved=updated.data;
  assert.equal((await admin.request(`/events/${saved.id}`,{method:'PUT',body:{version:1,title:'Stale'}})).status,409);
  assert.equal((await admin.request(`/entries/${entry.data.id}`,{method:'PUT',body:{version:1,status:'complete'}})).status,200);
  const state=(await admin.request('/state')).data;assert.ok(state.audit.some(value=>value.entity==='events'&&value.action==='update'));assert.ok(state.entries.some(value=>value.id===entry.data.id&&value.status==='complete'));
});

test('protected attachments enforce authorization, file validation, optimistic deletion and parent integrity',async t=>{
  const server=await serverFor(t),admin=await server.client(),viewer=await server.client('viewer');
  const path='/attachments/upload?targetType=events&targetId=event-briefing&filename=report.txt&description=Meeting%20report',raw=Buffer.from('Synthetic meeting report.');
  assert.equal((await fetch(`${server.url}/api${path}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:raw})).status,401);
  assert.equal((await viewer.request(path,{method:'POST',raw})).status,403);
  assert.equal((await admin.request(path,{method:'POST',raw,csrf:false})).status,403);
  assert.equal((await admin.request(path.replace('report.txt','report.svg'),{method:'POST',raw})).status,400);
  assert.equal((await admin.request(path.replace('report.txt','..%2Freport.txt'),{method:'POST',raw})).status,400);
  assert.equal((await admin.request(path.replace('report.txt','report.pdf'),{method:'POST',raw})).status,400);
  assert.equal((await admin.request(path.replace('event-briefing','missing'),{method:'POST',raw})).status,404);
  assert.equal((await admin.request(path,{method:'POST',raw:Buffer.alloc(10*1024*1024+1,97)})).status,413);
  const uploaded=await admin.request(path,{method:'POST',raw});assert.equal(uploaded.status,201);const file=uploaded.data;assert.equal(file.size,raw.length);assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.equal(file.uploadedBy,'Operations administrator');
  assert.equal((await fetch(`${server.url}/api/attachments/${file.id}/download`)).status,401);
  const download=await viewer.request(`/attachments/${file.id}/download`);assert.equal(download.status,200);assert.deepEqual(download.bytes,raw);assert.match(download.headers.get('content-disposition'),/^attachment;/);assert.equal(download.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await admin.request('/attachments',{method:'POST',body:file})).status,404);
  assert.equal((await admin.request(`/attachments/${file.id}`,{method:'PUT',body:{...file,targetId:'missing'}})).status,404);
  assert.equal((await admin.request('/events/event-briefing',{method:'DELETE',body:{version:1}})).status,409);
  assert.equal((await admin.request(`/attachments/${file.id}`,{method:'DELETE',body:{version:2}})).status,409);
  assert.equal((await viewer.request(`/attachments/${file.id}`,{method:'DELETE',body:{version:1}})).status,403);
  const link=await admin.request('/attachments/link',{method:'POST',body:{targetType:'events',targetId:'event-briefing',name:'Shared report folder',url:'https://drive.google.com/drive/folders/example',description:'External access is managed by the owner.'}});assert.equal(link.status,201);assert.equal(link.data.kind,'link');
  assert.equal((await admin.request('/attachments/link',{method:'POST',body:{targetType:'events',targetId:'event-briefing',name:'Unsafe',url:'file:///C:/report.pdf'}})).status,400);
  const storage=await admin.request('/storage');assert.equal(storage.data.usedBytes,raw.length);assert.equal(storage.data.fileCount,1);
  assert.equal((await admin.request(`/attachments/${file.id}`,{method:'DELETE',body:{version:1}})).status,200);assert.equal(server.app.locals.db.prepare('SELECT COUNT(*) AS n FROM attachment_blobs').get().n,0);
});

test('backups preserve file bytes and custom data; corrupted files fail atomically and old backups hydrate defaults',async t=>{
  const server=await serverFor(t),admin=await server.client();
  const uploaded=await admin.request('/attachments/upload?targetType=events&targetId=event-briefing&filename=report.txt',{method:'POST',raw:Buffer.alloc(10*1024*1024,97)});assert.equal(uploaded.status,201);
  const backup=(await admin.request('/backup')).data;assert.equal(backup.attachmentBlobs.length,1);assert.equal(backup.state.attachments.length,1);assert.doesNotMatch(JSON.stringify(backup),/password_hash|token_hash|csrfToken/);
  const target=createApp({dbPath:':memory:',mode:'production',adminPassword:'Initial-Password123!'});t.after(()=>target.locals.close());const copy={...structuredClone(backup),mode:'production'};
  copy.attachmentBlobs[0].data=Buffer.from('Corrupted report').toString('base64');
  assert.throws(()=>restoreBackup(target.locals.db,target.locals.getState,'production',copy),/metadata/);assert.equal(target.locals.getState().events.length,0);
  copy.attachmentBlobs=backup.attachmentBlobs;restoreBackup(target.locals.db,target.locals.getState,'production',copy);
  assert.equal(target.locals.getState().events.length,3);assert.equal(target.locals.getState().entries.length,2);assert.equal(target.locals.getState().volunteers[0].customFields['field-preferred-role'],'Welcome desk');
  const reexport=exportBackup(target.locals.db,target.locals.getState,'production');assert.deepEqual(reexport.attachmentBlobs,backup.attachmentBlobs);
  const legacy={...structuredClone(backup),mode:'production'};delete legacy.attachmentBlobs;for(const key of ['events','eventTypes','entries','fieldDefinitions','attachments'])delete legacy.state[key];for(const volunteer of legacy.state.volunteers)for(const key of ['customFields','tags','address','contactPreference','emergencyContact'])delete volunteer[key];for(const record of legacy.state.records){delete record.customFields;delete record.eventId;}
  const oldTarget=createApp({dbPath:':memory:',mode:'production',adminPassword:'Initial-Password123!'});t.after(()=>oldTarget.locals.close());restoreBackup(oldTarget.locals.db,oldTarget.locals.getState,'production',legacy);
  const restored=oldTarget.locals.getState();assert.deepEqual(restored.events,[]);assert.deepEqual(restored.volunteers[0].customFields,{});assert.deepEqual(restored.volunteers[0].emergencyContact,{name:'',relationship:'',phone:''});assert.equal(restored.records[0].eventId,'');
});

test('field capacity includes archived definitions and blocks a scope move past the limit',async t=>{
  const server=await serverFor(t),admin=await server.client(),db=server.app.locals.db;
  for(let index=0;index<99;index++){const definition={...field,id:`capacity-${index}`,version:1,label:`Capacity field ${index}`,active:index%2===0};db.prepare('INSERT INTO entities VALUES(?,?,?,?)').run('fieldDefinitions',definition.id,1,JSON.stringify(definition));}
  assert.equal((await admin.request('/state')).data.fieldDefinitions.filter(value=>value.scope==='volunteers').length,100);
  const rejected=await admin.request('/fieldDefinitions',{method:'POST',body:{...field,label:'Over capacity'}});assert.equal(rejected.status,409);assert.match(rejected.data.error,/100 custom fields/);
  assert.equal((await admin.request('/fieldDefinitions/capacity-0',{method:'PUT',body:{version:1,label:'Renamed within capacity'}})).status,200);
  const other=(await admin.request('/fieldDefinitions',{method:'POST',body:{...field,label:'Another event field',scope:'events'}})).data;
  assert.equal((await admin.request(`/fieldDefinitions/${other.id}`,{method:'PUT',body:{version:1,scope:'volunteers'}})).status,409);
});

test('restore checks destination emptiness again under its write lock',t=>{
  const target=createApp({dbPath:':memory:',mode:'production',adminPassword:'Initial-Password123!'});t.after(()=>target.locals.close());
  const backup=exportBackup(target.locals.db,target.locals.getState,'production'),project=seedState('2026-10-08').projects[0];let inserted=false;
  const getStateWithConcurrentWrite=()=>{const state=target.locals.getState();if(!inserted){inserted=true;target.locals.db.prepare('INSERT INTO entities VALUES(?,?,?,?)').run('projects',project.id,project.version,JSON.stringify(project));}return state;};
  assert.throws(()=>restoreBackup(target.locals.db,getStateWithConcurrentWrite,'production',backup),/destination changed during validation/);
  assert.deepEqual(target.locals.getState().projects,[project],'The concurrent record survives and the import adds nothing.');
  assert.equal(target.locals.getState().audit.filter(value=>value.action==='restore').length,0);
});

test('restore applies the same per-record attachment capacity as uploads',t=>{
  const source=createApp({dbPath:':memory:',mode:'demo',demoDate:'2026-10-08'});t.after(()=>source.locals.close());
  const target=createApp({dbPath:':memory:',mode:'production',adminPassword:'Initial-Password123!'});t.after(()=>target.locals.close());
  const backup={...exportBackup(source.locals.db,source.locals.getState,'demo'),mode:'production'};
  backup.state.attachments=Array.from({length:201},(_,index)=>({id:`link-${index}`,version:1,targetType:'events',targetId:'event-briefing',name:`Document ${index}`,kind:'link',url:`https://example.invalid/${index}`,contentType:'',size:0,sha256:'',uploadedBy:'Coordinator',description:''}));
  assert.throws(()=>restoreBackup(target.locals.db,target.locals.getState,'production',backup),/200 attachments per record/);
  assert.equal(target.locals.getState().volunteers.length,0);
  backup.state.attachments.pop();restoreBackup(target.locals.db,target.locals.getState,'production',backup);assert.equal(target.locals.getState().attachments.length,200);
});
