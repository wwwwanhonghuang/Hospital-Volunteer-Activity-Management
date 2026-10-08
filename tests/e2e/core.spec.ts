// SPDX-License-Identifier: AGPL-3.0-only
import {test,expect} from '@playwright/test';
test('overview and navigation render real state without runtime errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Operations overview'})).toBeVisible();
  const state=await(await page.request.get('/api/state')).json();
  const date=await page.getByLabel('Workspace date',{exact:true}).inputValue();
  const shifts=state.shifts.filter((s:any)=>s.date===date&&s.status!=='cancelled');
  await expect(page.locator('.stat-card').first().locator('.stat-value')).toContainText(String(new Set(shifts.flatMap((s:any)=>s.volunteerIds)).size));
  await page.getByRole('button',{name:'Search workspace',exact:false}).click();
  await page.getByRole('textbox',{name:'Search volunteers, projects, shifts, events and requests'}).fill(state.volunteers[0].name);
  await expect(page.locator('.search-results')).toContainText(state.volunteers[0].name);
  await page.keyboard.press('Escape');
  for(const name of ['Projects & planning','Schedule','Events & meetings','Spatial simulation','Reports & insights']){
    await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:false}).click();
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.getByText('This view could not load')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
test('project creation, dependencies and what-if persist actual CPM changes',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Projects & planning',exact:true}).click();
  await page.getByRole('button',{name:'New project',exact:true}).click();
  const title=`Browser planning ${Date.now()}`;
  await page.getByLabel('Project title',{exact:true}).fill(title);
  await page.getByLabel('Project owner',{exact:true}).fill('Review coordinator');
  await page.getByLabel('Purpose & approach',{exact:true}).fill('A browser-validated programme with explicit dependencies.');
  await page.getByRole('button',{name:'Save project',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button').filter({has:page.getByRole('heading',{name:title,exact:true})}).click();
  for(const [name,duration] of [['Preparation','2'],['Delivery','3']]){
    await page.getByRole('button',{name:'Add task',exact:true}).click();
    await page.getByLabel('Task title',{exact:true}).fill(name);
    await page.getByLabel('Duration (calendar days)',{exact:true}).fill(duration);
    if(name==='Delivery')await page.getByRole('checkbox',{name:'Preparation'}).check();
    await page.getByRole('button',{name:'Save task',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await expect(page.locator('.gantt-footer')).toContainText('5 calendar days');
  await page.getByRole('button',{name:'What-if',exact:true}).click();
  await page.getByRole('slider').fill('4');
  await expect(page.locator('.scenario-metrics')).toContainText('+2 days');
  await page.getByRole('button',{name:'Apply duration',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.gantt-footer')).toContainText('7 calendar days');
  const state=await(await page.request.get('/api/state')).json();
  const project=state.projects.find((p:any)=>p.title===title);
  const tasks=state.tasks.filter((t:any)=>t.projectId===project.id);
  expect(tasks.find((t:any)=>t.title==='Preparation').duration).toBe(4);
  expect(tasks.find((t:any)=>t.title==='Delivery').dependencies).toEqual([tasks.find((t:any)=>t.title==='Preparation').id]);
});
test('suggested assignments apply, persist, and export a valid calendar',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Schedule',exact:true}).click();
  await page.getByRole('button',{name:'Suggest assignments',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Apply reviewed plan',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Reviewed assignments applied');
  await page.reload();await expect(page.locator('.schedule-summary')).toContainText('100%');
  await page.getByRole('button',{name:'Week',exact:true}).click();await expect(page.locator('.week-column')).toHaveCount(7);
  await page.getByRole('button',{name:'Coverage',exact:true}).click();await expect(page.locator('.coverage-card')).toHaveCount(6);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export calendar',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
});
test('mobile navigation and primary content fit a phone viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Operations overview'})).toBeVisible();
  for(const route of ['Volunteers','Projects & planning','Schedule','Reports & insights']){
    await page.getByRole('button',{name:'Open navigation',exact:true}).click();
    await page.getByRole('navigation').getByRole('button',{name:route,exact:true}).click();
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
});
