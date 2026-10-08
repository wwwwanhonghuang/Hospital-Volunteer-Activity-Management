// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

async function runServer(options={}) {
  const app=createApp({dbPath:':memory:',mode:'demo',demoDate:'2026-10-08',...options});
  const server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});
  const url=`http://127.0.0.1:${server.address().port}`;
  return {app,url,async close(){await new Promise(resolve=>server.close(resolve));app.locals.close();}};
}
async function client(server,role='admin',password) {
  const response=await fetch(`${server.url}/api/${password?'login':'demo-login'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:role,password})});
  assert.equal(response.status,200);const session=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
  return {session,cookie,async request(path,{method='GET',body,csrf=true,headers={}}={}){
    const response=await fetch(`${server.url}/api${path}`,{method,headers:{Cookie:cookie,'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':session.csrfToken}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,headers:response.headers};
  }};
}
const project={title:'Test programme',category:'Training',description:'Test plan',owner:'Operations',department:'Administration',status:'planning',startDate:'2026-10-01',dueDate:'2026-10-31',budget:10000,spent:0,goals:'Orientation',risks:''};

test('authentication, CSRF, origin, role checks and safe secret-free backups',async t=>{
  const server=await runServer();t.after(()=>server.close());
  assert.equal((await fetch(`${server.url}/api/state`)).status,401);
  const admin=await client(server),viewer=await client(server,'viewer'),coordinator=await client(server,'coordinator');
  assert.equal((await admin.request('/session')).data.user.role,'admin');
  assert.equal((await viewer.request('/state')).status,200);
  assert.equal((await viewer.request('/projects',{method:'POST',body:project})).status,403);
  assert.equal((await admin.request('/projects',{method:'POST',body:project,csrf:false})).status,403);
  assert.equal((await admin.request('/projects',{method:'POST',body:project,headers:{Origin:'https://attacker.example'}})).status,403);
  assert.equal((await coordinator.request('/backup')).status,403);
  assert.equal((await admin.request(`/users/${admin.session.user.id}`,{method:'PUT',body:{role:'viewer'}})).status,409,'The last administrator cannot be demoted');
  const backup=await admin.request('/backup');assert.equal(backup.status,200);assert.equal(backup.data.format,'shuori-backup');assert.match(backup.headers.get('content-disposition'),/shuori-backup-/);assert.equal(backup.data.schemaVersion,1);assert.ok(backup.data.state.volunteers.length>=18);assert.doesNotMatch(JSON.stringify(backup.data),/password_hash|token_hash|csrfToken/);
  const user=await admin.request('/users',{method:'POST',body:{username:'test.reader',name:'Test Reader',role:'viewer',password:'VeryStrong-Test123!'}});assert.equal(user.status,201);
  const signedIn=await client(server,'test.reader','VeryStrong-Test123!');assert.equal(signedIn.session.user.role,'viewer');
  assert.equal((await admin.request(`/users/${user.data.id}`,{method:'PUT',body:{role:'coordinator'}})).status,200);
  assert.equal((await signedIn.request('/state')).status,401,'Role changes revoke existing sessions');
  assert.equal((await viewer.request('/logout',{method:'POST'})).status,200);assert.equal((await viewer.request('/state')).status,401);
});

test('CRUD validates references, detects cycles and stale writes, preserves audit and escapes CSV formulas',async t=>{
  const server=await runServer();t.after(()=>server.close());const admin=await client(server);
  const created=await admin.request('/projects',{method:'POST',body:{...project,title:'=HYPERLINK("https://example.invalid")'}});assert.equal(created.status,201);const id=created.data.id;
  const updated=await admin.request(`/projects/${id}`,{method:'PUT',body:{version:1,description:'Revised'}});assert.equal(updated.status,200);assert.equal(updated.data.version,2);
  const before=(await admin.request('/state')).data.audit.length;
  assert.equal((await admin.request(`/projects/${id}`,{method:'PUT',body:{version:1,title:'Stale'}})).status,409);
  assert.equal((await admin.request(`/projects/${id}`,{method:'DELETE',body:{version:1}})).status,409);
  assert.equal((await admin.request('/state')).data.audit.length,before);
  const task=await admin.request('/tasks',{method:'POST',body:{projectId:id,title:'First',duration:2,dependencies:[],status:'todo',progress:0,assignee:''}});assert.equal(task.status,201);
  const second=await admin.request('/tasks',{method:'POST',body:{projectId:id,title:'Second',duration:3,dependencies:[task.data.id],status:'todo',progress:0,assignee:''}});assert.equal(second.status,201);
  const cycle=await admin.request(`/tasks/${task.data.id}`,{method:'PUT',body:{version:1,dependencies:[second.data.id]}});assert.equal(cycle.status,400);assert.match(cycle.data.error,/cycle/);
  assert.equal((await admin.request('/tasks',{method:'POST',body:{...task.data,id:undefined,projectId:'missing'}})).status,400);
  assert.equal((await admin.request(`/projects/${id}`,{method:'DELETE',body:{version:2}})).status,409);
  const csv=await admin.request('/export/projects.csv');assert.equal(csv.status,200);assert.ok(csv.data.includes("'=HYPERLINK"));assert.match(csv.headers.get('content-type'),/text\/csv/);
  assert.equal((await admin.request('/resources',{method:'POST',body:{name:'Bad quantity',category:'Supplies',locationId:'entrance',quantity:1,available:2,inspectedDate:'2026-10-08',status:'ready',notes:''}})).status,400);
  assert.equal((await admin.request('/projects',{method:'POST',body:{...project,startDate:'2026-02-30'}})).status,400);
  assert.equal((await admin.request('/shifts',{method:'POST',body:{title:'Impossible completed shift',date:'2099-01-01',start:'09:00',end:'12:00',locationId:'entrance',requiredSkills:[],requiredCount:1,volunteerIds:[],status:'completed',projectId:'',notes:''}})).status,400);
});

test('readiness changes flag stale assignments without blocking unrelated operations',async t=>{
  const server=await runServer();t.after(()=>server.close());const admin=await client(server);
  const state=(await admin.request('/state')).data,shift=state.shifts.find(value=>value.date==='2026-10-08'&&value.volunteerIds.length),volunteer=state.volunteers.find(value=>value.id===shift.volunteerIds[0]);
  const cleared=await admin.request(`/volunteers/${volunteer.id}`,{method:'PUT',body:{version:volunteer.version,healthStatus:'followup'}});assert.equal(cleared.status,200);
  const unrelated=await admin.request('/projects',{method:'POST',body:project});assert.equal(unrelated.status,201);
  const suggestion=await admin.request('/schedule/suggest',{method:'POST',body:{date:shift.date}});assert.equal(suggestion.status,200);assert.match(suggestion.data.explanations.join(' '),/review existing assignment/);
  const invalid=await admin.request(`/shifts/${shift.id}`,{method:'PUT',body:{version:shift.version,notes:'Review attempted'}});assert.equal(invalid.status,400);assert.match(invalid.data.error,/clearance/);
  const fixed=await admin.request(`/shifts/${shift.id}`,{method:'PUT',body:{version:shift.version,volunteerIds:shift.volunteerIds.filter(id=>id!==volunteer.id)}});assert.equal(fixed.status,200);
});

test('sign-in rate limiting and malformed request errors reveal no internal details',async t=>{
  const server=await runServer();t.after(()=>server.close());
  const malformed=await fetch(`${server.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"password": unclosed'});assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{error:'Invalid JSON request.'});
  for(let index=0;index<20;index++){const response=await fetch(`${server.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,400);}
  const blocked=await fetch(`${server.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('Retry-After'))>0);
});

test('schedule apply rejects double bookings and stale proposals atomically',async t=>{
  const server=await runServer();t.after(()=>server.close());const admin=await client(server);
  const volunteer=await admin.request('/volunteers',{method:'POST',body:{name:'Available Volunteer',kana:'',email:'test@example.invalid',phone:'',status:'active',skills:['Wayfinding'],languages:['English'],trainingStatus:'complete',healthStatus:'cleared',healthDueDate:'2027-01-01',availability:['Monday'],availableFrom:'08:00',availableTo:'17:00',maxHoursPerWeek:12,joinedDate:'2026-01-01',notes:''}});assert.equal(volunteer.status,201);
  const shift={title:'Independent test shift',date:'2026-10-05',start:'09:00',end:'12:00',locationId:'entrance',requiredSkills:['Wayfinding'],requiredCount:1,volunteerIds:[],status:'confirmed',projectId:'',notes:''};
  const first=(await admin.request('/shifts',{method:'POST',body:shift})).data,second=(await admin.request('/shifts',{method:'POST',body:{...shift,locationId:'library'}})).data;
  const changes=[first,second].map(value=>({id:value.id,version:value.version,volunteerIds:[volunteer.data.id]}));
  const invalid=await admin.request('/schedule/apply',{method:'POST',body:{changes}});assert.equal(invalid.status,400);assert.match(invalid.data.error,/Conflicts/);
  let state=(await admin.request('/state')).data;for(const value of [first,second]){assert.equal(state.shifts.find(s=>s.id===value.id).version,1);assert.deepEqual(state.shifts.find(s=>s.id===value.id).volunteerIds,[]);}
  assert.equal((await admin.request('/schedule/apply',{method:'POST',body:{changes:[changes[0]]}})).status,200);
  assert.equal((await admin.request('/schedule/apply',{method:'POST',body:{changes:[changes[0]]}})).status,409);
  const record=await admin.request('/records',{method:'POST',body:{volunteerId:volunteer.data.id,shiftId:first.id,date:shift.date,hours:3,serviceCount:4,category:'Guidance',notes:''}});assert.equal(record.status,201);
  assert.equal((await admin.request('/records',{method:'POST',body:record.data})).status,409);
  const suggestion=await admin.request('/schedule/suggest',{method:'POST',body:{date:'2026-10-08'}});assert.equal(suggestion.status,200);assert.ok(Array.isArray(suggestion.data.changes));
  const applied=await admin.request('/schedule/apply',{method:'POST',body:{changes:suggestion.data.changes}});assert.equal(applied.status,200);assert.equal(applied.data.updated,suggestion.data.changes.length);
});

test('SQLite survives a restart, production starts empty and disables demo entry',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'komorebi-test-')),dbPath=join(dir,'production.sqlite');let server;t.after(async()=>{if(server)await server.close();rmSync(dir,{recursive:true,force:true});});
  assert.throws(()=>createApp({mode:'production',dbPath:':memory:',adminPassword:'weak'}),/ADMIN_PASSWORD/);
  server=await runServer({mode:'production',dbPath,adminPassword:'Initial-Password123!',secureCookies:false});
  assert.equal((await fetch(`${server.url}/api/demo-login`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
  let admin=await client(server,'admin','Initial-Password123!');assert.equal((await admin.request('/state')).data.volunteers.length,0);
  const result=await admin.request('/projects',{method:'POST',body:project});assert.equal(result.status,201);await server.close();server=undefined;
  server=await runServer({mode:'production',dbPath,secureCookies:false});admin=await client(server,'admin','Initial-Password123!');assert.equal((await admin.request('/state')).data.projects[0].id,result.data.id);
  assert.throws(()=>createApp({mode:'demo',dbPath}),/mode differs/);
});

test('backup CLI restores validated operational data into an empty production workspace without credentials',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'komorebi-restore-')),source=join(dir,'source.sqlite'),target=join(dir,'target.sqlite'),snapshot=join(dir,'backup.json');let server;
  t.after(async()=>{if(server)await server.close();rmSync(dir,{recursive:true,force:true});});
  server=await runServer({mode:'production',dbPath:source,adminPassword:'Source-Password123!',secureCookies:false});
  const admin=await client(server,'admin','Source-Password123!');const created=await admin.request('/projects',{method:'POST',body:project});assert.equal(created.status,201);await server.close();server=undefined;
  const exported=spawnSync(process.execPath,['scripts/backup.mjs',snapshot],{encoding:'utf8',env:{...process.env,APP_MODE:'production',DATABASE_PATH:source}});assert.equal(exported.status,0,exported.stderr);assert.equal(JSON.parse(readFileSync(snapshot,'utf8')).format,'shuori-backup');assert.doesNotMatch(readFileSync(snapshot,'utf8'),/password_hash|token_hash|Source-Password/);
  const restored=spawnSync(process.execPath,['scripts/backup.mjs','--restore',snapshot],{encoding:'utf8',env:{...process.env,APP_MODE:'production',DATABASE_PATH:target,ADMIN_PASSWORD:'Restored-Password123!'}});assert.equal(restored.status,0,restored.stderr);
  const app=createApp({mode:'production',dbPath:target});try{assert.equal(app.locals.getState().projects[0].id,created.data.id);assert.ok(app.locals.getState().audit.some(entry=>entry.action==='restore'));}finally{app.locals.close();}
  const repeated=spawnSync(process.execPath,['scripts/backup.mjs','--restore',snapshot],{encoding:'utf8',env:{...process.env,APP_MODE:'production',DATABASE_PATH:target}});assert.notEqual(repeated.status,0);assert.match(repeated.stderr,/empty workspace/);
});
