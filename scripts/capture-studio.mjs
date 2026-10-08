// SPDX-License-Identifier: AGPL-3.0-only
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:3001';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1100},timezoneId:'Asia/Tokyo'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/#/spatial`);await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await page.getByRole('heading',{name:'Hospital in perspective.'}).waitFor();
  await fs.mkdir('artifacts/previews',{recursive:true});
  const panels=page.getByRole('group',{name:'Spatial studio panels'});
  const capture=async name=>{await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.waitForTimeout(500);await page.screenshot({path:`artifacts/previews/${name}.png`,fullPage:true});};
  await page.getByRole('button',{name:'6F',exact:true}).click();
  await page.getByRole('button',{name:'Hide zone labels',exact:true}).click();
  await page.getByLabel('Search scene objects', {exact:true}).fill('book collection');
  await page.locator('.studio-object-select').nth(1).click();
  await page.getByRole('button',{name:'Focus selected object',exact:true}).click();
  const libraryCanvas=page.locator('.scene-stage canvas');await libraryCanvas.scrollIntoViewIfNeeded();await page.waitForTimeout(350);
  const libraryBounds=await libraryCanvas.boundingBox();
  await page.mouse.move(libraryBounds.x+libraryBounds.width*.3,libraryBounds.y+libraryBounds.height*.7);await page.mouse.down();
  await page.mouse.move(libraryBounds.x+libraryBounds.width*.65,libraryBounds.y+libraryBounds.height*.7,{steps:20});await page.mouse.up();
  await capture('studio-library-detail');
  await page.getByRole('button',{name:'Reset view',exact:true}).click();
  await panels.getByRole('button',{name:'Assets',exact:true}).click();
  await capture('studio-asset-library');
  await page.getByRole('button',{name:'1F',exact:true}).click();
  await panels.getByRole('button',{name:'Objects',exact:true}).click();
  await page.getByLabel('Search scene objects', {exact:true}).fill('wheelchair');
  await page.locator('.studio-object-select').first().click();
  await page.getByRole('button',{name:'Focus selected object',exact:true}).click();
  await page.getByRole('button',{name:'Rotate',exact:true}).click();
  await capture('studio-equipment-detail');
  await panels.getByRole('button',{name:'People',exact:true}).click();
  if(await page.locator('.studio-person-select').count()){
    await page.locator('.studio-person-select').first().click();await capture('studio-volunteer-detail');
    await page.getByRole('button',{name:'Draw rehearsal route',exact:true}).first().click();
    for(const point of [[-27,15],[-27,0],[-9,0],[-9,7]]){await page.getByRole('spinbutton',{name:'Route point X',exact:true}).fill(String(point[0]));await page.getByRole('spinbutton',{name:'Route point Z',exact:true}).fill(String(point[1]));await page.getByRole('button',{name:'Add route point',exact:true}).click();}
    await capture('studio-route-drawing');
  }
  console.log(JSON.stringify({errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
