// SPDX-License-Identifier: AGPL-3.0-only
import {chromium} from '@playwright/test';
import {PNG} from '../node_modules/playwright-core/lib/utilsBundle.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// Pixel detection targets Three's saturated axis handles, not architectural geometry.
// This complements numeric-field tests with real pointer manipulation of the gizmo.
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}});
  const writes=[];page.on('request',request=>{if(request.url().includes('/api/')&&!['GET','HEAD'].includes(request.method())&&!request.url().endsWith('/api/demo-login'))writes.push(request.url());});
  await page.goto('http://127.0.0.1:3001/#/spatial');await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await page.getByRole('heading',{name:'Hospital in perspective.'}).waitFor();
  await page.getByRole('button',{name:'1F',exact:true}).click();
  await page.getByRole('group',{name:'Spatial studio panels'}).getByRole('button',{name:'Assets',exact:true}).click();
  await page.getByRole('button',{name:'Add Visitor chair',exact:true}).click();
  await page.getByRole('button',{name:'Focus selected object',exact:true}).click();
  await page.getByRole('button',{name:'Move',exact:true}).click();
  const canvas=page.locator('.scene-stage canvas');await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(500);
  async function handle(color){
    const png=PNG.sync.read(await canvas.screenshot());const points=[];
    for(let y=60;y<png.height-60;y++)for(let x=60;x<png.width-60;x++){const i=(y*png.width+x)*4;const [r,g,b]=png.data.subarray(i,i+3);if(color==='red'?r>185&&g<70&&b<70:g>180&&r<80&&b<90)points.push({x,y});}
    assert.ok(points.length>4,`${color} gizmo handle rendered`);
    points.sort((a,b)=>a.x-b.x);return points[Math.floor(points.length*.85)];
  }
  async function drag(point,dx,dy){const bounds=await canvas.boundingBox();await page.mouse.move(bounds.x+point.x,bounds.y+point.y);await page.mouse.down();await page.mouse.move(bounds.x+point.x+dx,bounds.y+point.y+dy,{steps:14});await page.mouse.up();await page.waitForTimeout(300);}
  const beforeX=Number(await page.getByLabel('Position X',{exact:true}).inputValue());
  const translationHandle=await handle('red');await drag(translationHandle,75,20);
  const afterX=Number(await page.getByLabel('Position X',{exact:true}).inputValue());
  assert.notEqual(afterX,beforeX,'Dragging the X handle updates the scene transform');
  assert.ok(Math.abs(afterX*4-Math.round(afterX*4))<.001,'Translation snaps to quarter-units');
  await page.getByRole('button',{name:'Rotate',exact:true}).click();await page.waitForTimeout(350);
  const beforeRotation=Number(await page.getByLabel('Rotation (degrees)',{exact:true}).inputValue());
  const rotationHandle=await handle('green');await drag(rotationHandle,-180,-20);
  const afterRotation=Number(await page.getByLabel('Rotation (degrees)',{exact:true}).inputValue());
  assert.notEqual(afterRotation,beforeRotation,'Dragging the rotation ring updates the scene transform');
  assert.ok(Math.abs(afterRotation/15-Math.round(afterRotation/15))<.001,'Rotation snaps to fifteen degrees');
  assert.equal(writes.length,0,'Pointer validation does not save operational changes');
  const report={checkedAt:new Date().toISOString(),translation:{beforeX,afterX,step:.25},rotation:{beforeRotation,afterRotation,step:15},operationalWrites:writes.length};
  await fs.writeFile('artifacts/qa/scene-handles.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
