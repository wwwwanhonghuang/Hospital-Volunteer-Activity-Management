// SPDX-License-Identifier: AGPL-3.0-only
import { eligibility } from '../shared/scheduling.mjs';
export function tokyoDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10);
}
export const locations = [
  { id: 'entrance', name: 'Main entrance', floor: '1F', building: 'Outpatient Building', x: -10, z: 8, capacity: 4, source: 'concept', description: 'Illustrative welcome station near the outpatient entrance. Position and capacity are planning assumptions.' },
  { id: 'reception', name: 'Reception & wayfinding', floor: '1F', building: 'Outpatient Building', x: 0, z: 5, capacity: 4, source: 'concept', description: 'Illustrative reception support station. Verify the operational desk with hospital staff.' },
  { id: 'outpatient', name: 'Outpatient support', floor: '1F', building: 'Outpatient Building', x: 8, z: -3, capacity: 4, source: 'concept', description: 'Conceptual volunteer meeting point for outpatient guidance; not a verified clinic position.' },
  { id: 'library', name: 'Nikoniko Bunko Plus', floor: '6F', building: 'Central Clinical Building 2', x: -7, z: -5, capacity: 3, source: 'official', description: 'Official library building and floor. Open Monday, Wednesday and Friday, 10:00–14:30. Geometry, station coordinates and capacity are illustrative.' },
  { id: 'garden', name: 'Courtyard activity station', floor: '1F', building: 'Concept activity zone', x: 10, z: 9, capacity: 6, source: 'concept', description: 'Proposed event station for simulation only; operational approval and a site check are required.' },
  { id: 'coordination', name: 'Volunteer coordination', floor: '1F', building: 'Concept operations zone', x: -9, z: -8, capacity: 4, source: 'concept', description: 'Illustrative volunteer briefing point; not an official hospital office location.' },
];
export function emptyState() { return { volunteers: [], projects: [], tasks: [], shifts: [], records: [], requests: [], resources: [], scenarios: [], eventTypes:[], events:[], fieldDefinitions:[], entries:[], attachments:[], audit: [], locations }; }
export function seedState(today = tokyoDate()) {
  const now = new Date().toISOString(), base = id => ({ id, version: 1, createdAt: now, updatedAt: now });
  const names = ['Aiko Tanaka', 'Daniel Kim', 'Emi Sato', 'Haruto Suzuki', 'Maya Chen', 'Kenji Mori', 'Yuki Nakamura', 'Sofia Garcia', 'Ren Ito', 'Hana Kobayashi', 'Oliver Park', 'Mei Watanabe', 'Sara Yamamoto', 'Leo Nishida', 'Nora Hayashi', 'Kai Takahashi', 'Rina Abe', 'Theo Matsuda'];
  const volunteers = names.map((name, i) => ({ ...base(`vol-${i + 1}`), name, kana: '', email: `volunteer${i + 1}@example.invalid`, phone: '', status: i === 14 ? 'onboarding' : i === 15 ? 'applicant' : i === 16 ? 'paused' : 'active', skills: i % 3 === 0 ? ['Wayfinding', 'Wheelchair support', 'Event support'] : i % 3 === 1 ? ['Wayfinding', 'Library support', 'Event support'] : ['Wayfinding', 'Library support'], languages: i % 4 === 0 ? ['Japanese', 'English'] : i % 4 === 1 ? ['Japanese', 'Korean'] : ['Japanese'], trainingStatus: i === 14 || i === 15 ? 'pending' : 'complete', healthStatus: i === 15 || i === 17 ? 'pending' : 'cleared', healthDueDate: addDays(today, i === 17 ? -2 : i === 12 ? 7 : 180), availability: i < 12 ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], availableFrom: '08:00', availableTo: i % 5 === 0 ? '13:00' : '17:00', maxHoursPerWeek: i % 4 === 0 ? 8 : 12, joinedDate: addDays(today, -120 - i * 13), notes: 'Synthetic demonstration profile. No real volunteer or health information.' }));
  volunteers.forEach(volunteer=>{volunteer.availability=volunteer.availability.map(day=>day.slice(0,3).toLowerCase());});
  const projects = [
    { ...base('project-welcome'), title: 'A warmer first visit', category: 'Patient experience', description: 'Improve the arrival experience through consistent greeting, accessible routes and volunteer support.', owner: 'Operations team', department: 'Medical Administration', status: 'active', startDate: addDays(today, -10), dueDate: addDays(today, 21), budget: 90000, spent: 32000, goals: 'Pilot an accessible welcome service. Gather anonymous feedback and publish the monthly service report.', risks: 'Peak-hour demand; changing clinic routes. Confirm all guidance with the department.' },
    { ...base('project-library'), title: 'Stories that connect', category: 'Library programme', description: 'Support Nikoniko Bunko Plus with a welcoming reading programme and a refreshed circulation workflow.', owner: 'Library team', department: 'Patient Services', status: 'planning', startDate: addDays(today, -3), dueDate: addDays(today, 35), budget: 60000, spent: 8000, goals: 'Prepare a themed reading shelf and brief volunteers on the library workflow.', risks: 'Library opening hours and infection-control requirements must be confirmed before activities.' },
    { ...base('project-autumn'), title: 'Autumn appreciation gathering', category: 'Events & recognition', description: 'Recognise volunteer contributions and share learning across departments at a small approved gathering.', owner: 'Volunteer office', department: 'Medical Administration', status: 'approved', startDate: addDays(today, -7), dueDate: addDays(today, 28), budget: 120000, spent: 18500, goals: 'Recognise participation and prepare a clear, inclusive event run sheet.', risks: 'Venue availability and hospital approval. The courtyard zone is a planning concept.' },
    { ...base('project-onboarding'), title: 'Ready to help: orientation', category: 'Recruitment & training', description: 'Coordinate recruitment, interviews, training and administrative health-clearance reminders for the next volunteer intake.', owner: 'Volunteer coordinator', department: 'Medical Administration', status: 'active', startDate: addDays(today, -14), dueDate: addDays(today, 14), budget: 30000, spent: 12000, goals: 'Complete orientation and administrative checks before assigning new volunteers.', risks: 'Do not record medical details here. Clearance decisions belong to authorised hospital staff.' },
  ];
  const taskSpecs = [
    ['welcome-1','project-welcome','Observe arrival demand',3,[],'done',100], ['welcome-2','project-welcome','Confirm department routes',4,['welcome-1'],'done',100], ['welcome-3','project-welcome','Prepare accessible guidance cards',5,['welcome-2'],'doing',60], ['welcome-4','project-welcome','Brief the pilot team',2,['welcome-2'],'todo',0], ['welcome-5','project-welcome','Run the welcome pilot',5,['welcome-3','welcome-4'],'todo',0], ['welcome-6','project-welcome','Review feedback and report',2,['welcome-5'],'todo',0],
    ['library-1','project-library','Agree programme with library staff',3,[],'doing',40], ['library-2','project-library','Select themed reading collection',5,['library-1'],'todo',0], ['library-3','project-library','Prepare circulation briefing',2,['library-1'],'todo',0], ['library-4','project-library','Launch reading programme',2,['library-2','library-3'],'todo',0],
    ['autumn-1','project-autumn','Confirm venue and approvals',4,[],'doing',50], ['autumn-2','project-autumn','Draft recognition list',3,[],'done',100], ['autumn-3','project-autumn','Prepare event run sheet',3,['autumn-1','autumn-2'],'todo',0], ['autumn-4','project-autumn','Volunteer appreciation event',1,['autumn-3'],'todo',0],
    ['onboarding-1','project-onboarding','Publish recruitment information',2,[],'done',100], ['onboarding-2','project-onboarding','Coordinate intake conversations',4,['onboarding-1'],'done',100], ['onboarding-3','project-onboarding','Complete orientation and reminders',5,['onboarding-2'],'doing',70], ['onboarding-4','project-onboarding','Review readiness and first assignments',2,['onboarding-3'],'todo',0],
  ];
  const tasks = taskSpecs.map(([id,projectId,title,duration,dependencies,status,progress]) => ({ ...base(id),projectId,title,duration,dependencies,status,progress,assignee: 'Volunteer coordinator' }));
  const shifts = [], records = [];
  for (let offset = -10; offset <= 6; offset++) {
    const date = addDays(today, offset), weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if ([0,6].includes(weekday) && offset !== 0) continue;
    const past = offset < 0;
    const entries = [
      ['welcome', 'Morning welcome', '09:00','12:00','entrance',['Wayfinding'],3, past ? ['vol-1','vol-2','vol-3'] : offset === 0 ? ['vol-1','vol-2'] : ['vol-3']],
      ['guidance', 'Outpatient guidance', '09:30','12:00','outpatient',['Wayfinding'],2,past ? ['vol-4','vol-5'] : ['vol-4']],
      ['afternoon', 'Afternoon reception', '13:00','15:00','reception',['Wayfinding'],2,past ? ['vol-6','vol-7'] : ['vol-7']],
    ];
    if ([1,3,5].includes(weekday)) entries.push(['library','Library welcome','10:00','12:00','library',['Library support'],2,past ? ['vol-8','vol-9'] : ['vol-8']]);
    for (const [key,title,start,end,locationId,requiredSkills,requiredCount,assigned] of entries) {
      const shift = { ...base(`shift-${date}-${key}`), title,date,start,end,locationId,requiredSkills,requiredCount,volunteerIds: assigned,status: past ? 'completed' : offset === 0 ? 'confirmed' : 'draft',projectId: key === 'library' ? 'project-library' : 'project-welcome',notes: 'Synthetic planning data. Confirm operational arrangements with the relevant department.' };
      // Distribute historical duties to keep workload and demo allocation realistic.
      if (past) shift.volunteerIds = assigned.map((_, j) => `vol-${1 + ((Math.abs(offset) * 3 + j + (key === 'afternoon' ? 6 : key === 'guidance' ? 3 : key === 'library' ? 8 : 0)) % 12)}`);
      if (offset>0)shift.volunteerIds=[];
      shifts.push(shift);
      if (past) shift.volunteerIds.forEach((volunteerId,j) => records.push({ ...base(`record-${date}-${key}-${j}`),volunteerId,shiftId:shift.id,date,hours:key === 'welcome' ? 3 : key === 'guidance' ? 2.5 : 2,serviceCount:12 + (Math.abs(offset) + j) % 12,category:key === 'library' ? 'Library support' : 'Visitor guidance',notes:'Synthetic service totals; no patient details.' }));
    }
  }
  // Keep today's intentionally partial roster feasible for the date the demo is created.
  for(const shift of shifts.filter(value=>value.date===today)) {
    shift.volunteerIds=shift.volunteerIds.filter(id=>eligibility(volunteers.find(person=>person.id===id),shift,shifts,records).eligible);
    for(const volunteer of volunteers) {
      if(shift.volunteerIds.length>=shift.requiredCount-1)break;
      if(!shift.volunteerIds.includes(volunteer.id)&&eligibility(volunteer,shift,shifts,records).eligible)shift.volunteerIds.push(volunteer.id);
    }
  }
  const requests = [
    { ...base('request-1'),title:'Improve the first-visit route card',category:'improvement',priority:'normal',status:'in_progress',owner:'Operations team',department:'Outpatient reception',dueDate:addDays(today,5),description:'Review contrast and readability of the draft guidance card with reception staff.',resolution:'' },
    { ...base('request-2'),title:'Coordinate orientation health reminders',category:'coordination',priority:'high',status:'open',owner:'Volunteer coordinator',department:'Medical Administration',dueDate:addDays(today,2),description:'Arrange private administrative reminders for upcoming clearance reviews. Keep clinical details in the approved hospital system.',resolution:'' },
    { ...base('request-3'),title:'Volunteer availability consultation',category:'consultation',priority:'normal',status:'open',owner:'Volunteer office',department:'Volunteer services',dueDate:addDays(today,4),description:'Discuss a change in preferred activity hours and update the volunteer schedule after agreement.',resolution:'' },
    { ...base('request-4'),title:'Library supply request completed',category:'coordination',priority:'low',status:'resolved',owner:'Library team',department:'Patient Services',dueDate:addDays(today,-2),description:'Refresh book covers and circulation labels.',resolution:'Supplies checked and delivered to the library team.' },
  ];
  const resources = [
    { ...base('resource-1'),name:'Guidance boards',category:'Wayfinding',locationId:'reception',quantity:8,available:6,inspectedDate:addDays(today,-2),status:'ready',notes:'Confirm displayed routes before each shift.' },
    { ...base('resource-2'),name:'Volunteer identification vests',category:'Volunteer supplies',locationId:'coordination',quantity:24,available:18,inspectedDate:addDays(today,-1),status:'ready',notes:'Clean supplies available at the briefing point.' },
    { ...base('resource-3'),name:'Library book carts',category:'Library supplies',locationId:'library',quantity:3,available:2,inspectedDate:addDays(today,-3),status:'ready',notes:'One cart is reserved by the library team.' },
    { ...base('resource-4'),name:'Portable event display',category:'Event supplies',locationId:'coordination',quantity:2,available:0,inspectedDate:addDays(today,-1),status:'maintenance',notes:'Inspection requested before the appreciation gathering.' },
    { ...base('resource-5'),name:'Visitor support wheelchairs',category:'Mobility support',locationId:'entrance',quantity:6,available:4,inspectedDate:today,status:'ready',notes:'Illustrative inventory. Use only after training and local approval.' },
  ];
  const eventTypes=[
    {...base('event-type-meeting'),name:'Team meeting',description:'Briefings, planning and retrospective conversations.',color:'blue',defaultModules:['meeting','checklist'],active:true},
    {...base('event-type-training'),name:'Training & orientation',description:'Learning sessions with attendance and preparation.',color:'purple',defaultModules:['attendance','checklist'],active:true},
    {...base('event-type-activity'),name:'Community activity',description:'Volunteer-led activities linked to projects and resources.',color:'green',defaultModules:['attendance','checklist'],active:true},
    {...base('event-type-review'),name:'Follow-up & review',description:'Administrative reviews and one-to-one support.',color:'amber',defaultModules:['checklist'],active:true},
  ];
  const eventBase={description:'Synthetic demonstration event. Confirm arrangements before operational use.',owner:'Volunteer coordinator',locationId:'coordination',locationText:'Volunteer briefing point',projectId:'',volunteerIds:[],shiftIds:[],resourceIds:[],meeting:{provider:'other',url:'',meetingId:'',passcode:'',agenda:''},checklist:[],attendance:[],customFields:{}};
  const events=[
    {...base('event-briefing'),...eventBase,title:'Welcome team planning circle',typeId:'event-type-meeting',date:today,endDate:today,start:'15:30',end:'16:15',status:'confirmed',modules:['meeting','checklist'],projectId:'project-welcome',volunteerIds:['vol-1','vol-2','vol-3'],meeting:{provider:'zoom',url:'',meetingId:'',passcode:'',agenda:'Review the welcome pilot, share observations and agree the next improvement.'},checklist:[{id:'briefing-agenda',title:'Prepare the anonymous feedback summary',done:true,owner:'Operations team',dueDate:today},{id:'briefing-notes',title:'Upload meeting notes and next actions',done:false,owner:'Volunteer coordinator',dueDate:addDays(today,1)}]},
    {...base('event-orientation'),...eventBase,title:'New volunteer orientation',typeId:'event-type-training',date:addDays(today,2),endDate:addDays(today,2),start:'10:00',end:'12:00',status:'draft',modules:['attendance','checklist'],projectId:'project-onboarding',volunteerIds:['vol-15','vol-16'],resourceIds:['resource-2'],attendance:[{volunteerId:'vol-15',status:'confirmed',notes:''},{volunteerId:'vol-16',status:'invited',notes:''}],checklist:[{id:'orientation-materials',title:'Prepare orientation materials',done:false,owner:'Volunteer office',dueDate:addDays(today,1)}]},
    {...base('event-library'),...eventBase,title:'Reading programme preparation',typeId:'event-type-activity',date:addDays(today,4),endDate:addDays(today,4),start:'13:00',end:'14:00',status:'draft',modules:['attendance','checklist'],locationId:'library',locationText:'Nikoniko Bunko Plus',projectId:'project-library',volunteerIds:['vol-2','vol-8'],resourceIds:['resource-3'],attendance:[{volunteerId:'vol-2',status:'invited',notes:''},{volunteerId:'vol-8',status:'invited',notes:''}]},
  ];
  const fieldDefinitions=[
    {...base('field-preferred-role'),scope:'volunteers',label:'Preferred contribution',type:'select',options:['Welcome desk','Library programme','Event support','Behind the scenes'],required:false,active:true,order:0},
    {...base('field-accessibility'),scope:'events',label:'Accessibility arrangements',type:'textarea',options:[],required:false,active:true,order:0},
    {...base('field-review-agreed'),scope:'entries',label:'Follow-up agreed',type:'boolean',options:[],required:false,active:true,order:0},
  ];
  volunteers.forEach((volunteer,i)=>{volunteer.contactPreference='email';volunteer.emergencyContact={name:'',relationship:'',phone:''};volunteer.address='';volunteer.tags=i<3?['Welcome team']:i>=14&&i<=15?['New intake']:[];volunteer.customFields={'field-preferred-role':['Welcome desk','Library programme','Behind the scenes'][i%3]};});
  events[1].customFields={'field-accessibility':'Offer a written agenda and step-free access. Confirm individual requests privately.'};
  const entries=[
    {...base('entry-orientation'),volunteerId:'vol-15',eventId:'event-orientation',title:'Orientation preparation check-in',category:'Onboarding',status:'open',date:today,dueDate:addDays(today,2),body:'Synthetic note: send the session agenda and confirm the preferred contact method. No clinical details.',customFields:{'field-review-agreed':true}},
    {...base('entry-appreciation'),volunteerId:'vol-2',eventId:'',title:'Welcome desk contribution recognised',category:'Recognition',status:'complete',date:addDays(today,-2),dueDate:'',body:'Synthetic note: thanked the volunteer for helping refine the first-visit guidance card.',customFields:{}},
  ];
  return { volunteers,projects,tasks,shifts,records,requests,resources,scenarios:[],eventTypes,events,fieldDefinitions,entries,attachments:[],locations,audit:[{ id:'audit-seed',timestamp:now,actor:'System',action:'seed',entity:'system',entityId:'demo',summary:'Loaded synthetic demonstration data. All names and records are fictional.' }] };
}
