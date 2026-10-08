// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCPM } from '../shared/cpm.mjs';
import { eligibility, suggestSchedule, weeklyHours } from '../shared/scheduling.mjs';

const volunteer={id:'a',name:'Aiko',status:'active',trainingStatus:'complete',healthStatus:'cleared',healthDueDate:'2026-12-31',availability:['Monday'],availableFrom:'08:00',availableTo:'17:00',skills:['Wayfinding'],maxHoursPerWeek:8};
const shift={id:'s1',version:1,title:'Welcome',date:'2026-10-05',start:'09:00',end:'12:00',locationId:'entrance',requiredSkills:['Wayfinding'],requiredCount:1,volunteerIds:[],status:'confirmed'};

test('critical path chooses a connected longest branch and gives the shorter branch float',()=>{
  const result=calculateCPM([{id:'a',duration:2,dependencies:[]},{id:'b',duration:5,dependencies:['a']},{id:'c',duration:2,dependencies:['a']},{id:'d',duration:1,dependencies:['b','c']}]);
  assert.equal(result.duration,8);assert.deepEqual(result.criticalPath,['a','b','d']);assert.equal(result.tasks.find(t=>t.id==='c').slack,3);assert.equal(result.tasks.find(t=>t.id==='c').critical,false);
});
test('critical path supports tied branches, disconnected components and an empty project',()=>{
  const result=calculateCPM([{id:'a',duration:2,dependencies:[]},{id:'b',duration:2,dependencies:[]},{id:'c',duration:1,dependencies:['a','b']}]);
  assert.equal(result.tasks.filter(task=>task.critical).length,3);assert.equal(result.criticalPath.length,2);assert.deepEqual(calculateCPM([]),{tasks:[],duration:0,criticalPath:[]});
});
test('invalid critical-path graphs fail explicitly',()=>{
  assert.throws(()=>calculateCPM([{id:'a',duration:2,dependencies:['b']},{id:'b',duration:1,dependencies:['a']}]),/cycle/);
  assert.throws(()=>calculateCPM([{id:'a',duration:1,dependencies:['absent']}]),/Missing/);
  assert.throws(()=>calculateCPM([{id:'a',duration:1,dependencies:[],projectId:'x'},{id:'b',duration:1,dependencies:['a'],projectId:'y'}]),/one project/);
  assert.throws(()=>calculateCPM([{id:'a',duration:0,dependencies:[]}]),/at least/);
});
test('eligibility requires all readiness checks and treats clearance due date as inclusive',()=>{
  assert.equal(eligibility({...volunteer,healthDueDate:shift.date},shift,[]).eligible,true);
  assert.equal(eligibility({...volunteer,healthDueDate:'2026-10-04'},shift,[]).eligible,false);
  for(const change of [{status:'paused'},{trainingStatus:'pending'},{healthStatus:'followup'},{availability:['Tuesday']},{availableTo:'11:00'},{skills:[]},{maxHoursPerWeek:2}])assert.equal(eligibility({...volunteer,...change},shift,[]).eligible,false,JSON.stringify(change));
});
test('overlap and transfer buffer accept exact boundaries and reject nine-minute transfers',()=>{
  const prior={...shift,id:'prior',start:'08:00',end:'09:00',volunteerIds:['a'],locationId:'library'};
  assert.equal(eligibility(volunteer,{...shift,start:'09:09'},[prior]).eligible,false);
  assert.equal(eligibility(volunteer,{...shift,start:'09:10'},[prior]).eligible,true);
  assert.equal(eligibility(volunteer,{...shift,locationId:'library'},[prior]).eligible,true);
  assert.equal(eligibility(volunteer,{...shift,start:'08:59',locationId:'library'},[prior]).eligible,false);
  assert.equal(eligibility(volunteer,shift,[{...prior,status:'cancelled'}]).eligible,true);
});
test('weekly actual hours replace planned hours and the ISO Monday boundary resets workload',()=>{
  const completed={...shift,id:'previous',date:'2026-10-05',volunteerIds:['a'],status:'completed'};
  const records=[{volunteerId:'a',shiftId:'previous',date:'2026-10-05',hours:2}];
  assert.equal(weeklyHours('a','2026-10-08',[completed],records),2);
  assert.equal(weeklyHours('a','2026-10-12',[completed],records),0);
  assert.equal(eligibility({...volunteer,availability:['Monday'],maxHoursPerWeek:4},{...shift,start:'13:00',end:'16:00'},[completed],records).eligible,false);
});
test('suggestion allocates the less-loaded volunteer, never double books, and reports unmet demand',()=>{
  const state={volunteers:[volunteer,{...volunteer,id:'b',name:'Emi'}],records:[],shifts:[{...shift,id:'prior',start:'08:00',end:'09:00',volunteerIds:['a']},shift,{...shift,id:'s2',title:'Another station',locationId:'library',requiredCount:2}]};
  const before=JSON.stringify(state);const result=suggestSchedule(state,shift.date);
  assert.equal(JSON.stringify(state),before,'Suggestion must not mutate state');
  assert.deepEqual(result.changes.find(change=>change.id==='s2').volunteerIds,['b'],'The less-loaded volunteer fills the scarcer location first');
  assert.deepEqual(result.changes.find(change=>change.id==='s1').volunteerIds,['a']);
  assert.equal(result.unfilled.find(item=>item.shiftId==='s2').missing,1);
});
test('suggestion preserves existing assignments and explains invalid existing readiness',()=>{
  const state={volunteers:[{...volunteer,status:'paused'}],records:[],shifts:[{...shift,volunteerIds:['a']}]};
  const result=suggestSchedule(state,shift.date);assert.deepEqual(result.changes,[]);assert.match(result.explanations.join(' '),/review existing assignment/);
});
