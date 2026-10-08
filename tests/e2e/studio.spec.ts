// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.setTimeout(90000);

async function openStudio(page: Page, username = 'admin') {
  const login = await page.request.post('/api/demo-login', { data: { username } });
  expect(login.ok()).toBe(true);
  await page.goto('/#/spatial');
  await expect(page.getByRole('heading', { name: /^Hospital in perspective/ })).toBeVisible();
}
async function selectFloor(page: Page, floor = '1F') {
  await page.getByRole('group', { name: 'Choose hospital floor' }).getByRole('button', { name: floor, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Scene objects', exact: true }).locator('.studio-count')).toHaveText(/^[1-9]\d+$/);
}
async function panel(page: Page, name: 'Objects' | 'Assets' | 'People' | 'Guide') {
  await page.getByRole('group', { name: 'Spatial studio panels' }).getByRole('button', { name, exact: true }).click();
}
async function saveScenario(page: Page) {
  const response = page.waitForResponse(value => /\/api\/scenarios(?:\/[^/]+)?$/.test(value.url()) && ['POST', 'PUT'].includes(value.request().method()));
  await page.getByRole('button', { name: 'Save scenario', exact: true }).click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const body = await saved.json();
  await expect(page.getByRole('status').filter({ hasText: 'Spatial scenario saved.' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Load saved scenario' })).toHaveValue(body.id);
  return body;
}

test('a detailed asset can be transformed, undone, saved, reloaded and exchanged as scenario JSON', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openStudio(page);
  await selectFloor(page);
  const title = `Browser spatial study ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Scenario name', exact: true }).fill(title);
  await panel(page, 'Assets');
  await page.getByRole('button', { name: 'Add Visitor chair', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Object inspector', exact: true });
  await expect(inspector.getByRole('heading', { name: 'Visitor chair', exact: true })).toBeVisible();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('-9');
  await page.getByLabel('Position X', { exact: true }).fill('7.5');
  await page.getByLabel('Position X', { exact: true }).press('Enter');
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('7.5');
  await page.getByRole('button', { name: 'Undo scene change', exact: true }).click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('-9');
  await page.getByRole('button', { name: 'Redo scene change', exact: true }).click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('7.5');
  await page.getByRole('button', { name: 'Rotate right 90 degrees', exact: true }).click();
  await expect(page.getByLabel('Rotation (degrees)', { exact: true })).toHaveValue('90');
  await inspector.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(inspector.getByText('Hidden', { exact: true })).toBeVisible();
  await expect(page.locator('.studio-scenario-name')).toContainText('Unsaved changes');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hospital in perspective.' })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Spatial simulation/ }).click();
  await expect(page.getByRole('textbox', { name: 'Scenario name', exact: true })).toHaveValue(title);
  await expect(page.locator('.studio-scenario-name')).toContainText('Unsaved changes');
  const saved = await saveScenario(page);
  expect(saved.additions).toHaveLength(1);
  const objectId = saved.additions[0].id;
  expect(saved.additions[0]).toMatchObject({ kind: 'chair', floor: '1F', name: 'Visitor chair' });
  expect(saved.objects[objectId]).toMatchObject({ x: 7.5, hidden: true });
  expect(saved.objects[objectId].rotation).toBeCloseTo(Math.PI / 2);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Scenario name', exact: true })).toHaveValue(title);
  await expect(page.locator('.studio-scenario-name')).toContainText('Saved to workspace');
  await selectFloor(page);
  await page.getByRole('searchbox', { name: 'Search scene objects' }).fill('Scenario addition');
  await page.getByRole('button', { name: 'Select Visitor chair, 1F, Scenario addition, hidden', exact: true }).click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('7.5');
  await expect(page.getByLabel('Rotation (degrees)', { exact: true })).toHaveValue('90');
  await expect(inspector.getByRole('button', { name: 'Show', exact: true })).toBeEnabled();

  await page.locator('.studio-file-menu summary').click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export scenario JSON', exact: true }).click();
  const download = await downloadEvent;
  const document = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(document.format).toBe('shuori-scene');
  expect(document.version).toBe(1);
  expect(document.scenario.objects[objectId]).toEqual(saved.objects[objectId]);
  expect(document.scenario).not.toHaveProperty('id');
  document.scenario.name = `${title} imported`;
  await page.locator('input[type="file"]').setInputFiles({ name: 'reviewed-spatial-study.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByRole('textbox', { name: 'Scenario name', exact: true })).toHaveValue(document.scenario.name);
  const imported = await saveScenario(page);
  expect(imported.id).not.toBe(saved.id);
  expect(imported.additions).toEqual(saved.additions);
  expect(imported.objects).toEqual(saved.objects);
  const state = await (await page.request.get('/api/state')).json();
  expect(state.scenarios.find((value: any) => value.id === saved.id)).toMatchObject({ name: title });
  expect(state.scenarios.find((value: any) => value.id === imported.id)).toMatchObject({ name: document.scenario.name });
  expect(errors).toEqual([]);
});

test('a volunteer rehearsal route is authored through coordinates and persists with its shift', async ({ page }) => {
  await openStudio(page);
  const before = await (await page.request.get('/api/state')).json();
  const date = await page.getByLabel('Workspace date', { exact: true }).inputValue();
  const shift = before.shifts.find((value: any) => value.date === date && !['draft', 'cancelled'].includes(value.status) && value.volunteerIds.length && value.start <= '10:00' && value.end > '10:00');
  expect(shift).toBeTruthy();
  const location = before.locations.find((value: any) => value.id === shift.locationId);
  const volunteer = before.volunteers.find((value: any) => value.id === shift.volunteerIds[0]);
  await selectFloor(page, location.floor);
  const title = `Route rehearsal ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Scenario name', exact: true }).fill(title);
  await panel(page, 'People');
  const person = page.locator('.studio-person-card').filter({ hasText: volunteer.name }).filter({ hasText: shift.title }).first();
  await person.getByRole('button', { name: 'Draw rehearsal route', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Rehearsal route editor', exact: true });
  await expect(editor.getByRole('button', { name: 'Apply route', exact: true })).toBeDisabled();
  for (const [x, z] of [[-9, 0], [-4, 0], [-4, 5]]) {
    await page.getByLabel('Route point X', { exact: true }).fill(String(x));
    await page.getByLabel('Route point Z', { exact: true }).fill(String(z));
    await editor.getByRole('button', { name: 'Add route point', exact: true }).click();
  }
  await expect(editor.locator('li')).toHaveCount(3);
  await editor.getByRole('button', { name: 'Remove route point 2', exact: true }).click();
  await expect(editor.locator('li')).toHaveCount(2);
  await editor.getByRole('button', { name: 'Apply route', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(person).toContainText('Custom route · 2 points');
  const saved = await saveScenario(page);
  expect(saved.routes).toHaveLength(1);
  expect(saved.routes[0]).toMatchObject({ volunteerId: volunteer.id, shiftId: shift.id, floor: location.floor, points: [{ x: -9, z: 0 }, { x: -4, z: 5 }] });
  await page.reload();
  await selectFloor(page, location.floor);
  await panel(page, 'People');
  await expect(person).toContainText('Custom route · 2 points');
  await person.getByRole('button', { name: 'Edit rehearsal route', exact: true }).click();
  await expect(editor.locator('li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click();
  await page.getByRole('slider', { name: 'Simulation time', exact: true }).fill('610');
  await expect(page.getByRole('slider', { name: 'Simulation time', exact: true })).toHaveAttribute('aria-valuetext', '10:10 Japan Standard Time');
  const after = await (await page.request.get('/api/state')).json();
  expect(after.shifts).toEqual(before.shifts);
  expect(after.volunteers).toEqual(before.volunteers);
  expect(after.scenarios.find((value: any) => value.id === saved.id).routes).toEqual(saved.routes);
});

test('a viewer can inspect the detailed model on mobile while editing remains unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page, 'viewer');
  await selectFloor(page);
  await expect(page.getByRole('textbox', { name: 'Scenario name', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save scenario', exact: true })).toBeDisabled();
  await page.getByRole('searchbox', { name: 'Search scene objects' }).fill('chair');
  await page.getByRole('region', { name: 'Scene objects', exact: true }).getByRole('button', { name: /^Select / }).first().click();
  const inspector = page.getByRole('region', { name: 'Object inspector', exact: true });
  await expect(inspector.getByRole('button', { name: 'Focus', exact: true })).toBeEnabled();
  for (const name of ['Move', 'Rotate', 'Hide', 'Reset']) await expect(inspector.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(page.getByLabel('Position X', { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel(page, 'Assets');
  await expect(page.getByRole('button', { name: 'Add Visitor chair', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel(page, 'People');
  const routeButtons = page.getByRole('button', { name: 'Draw rehearsal route', exact: true });
  expect(await routeButtons.count()).toBeGreaterThan(0);
  for (const button of await routeButtons.all()) await expect(button).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('focused source furniture can be selected with the mouse, hidden, shown and reset', async ({ page }) => {
  await openStudio(page);
  await selectFloor(page, '6F');
  await page.getByRole('searchbox', { name: 'Search scene objects' }).fill('Book collection');
  const browser = page.getByRole('region', { name: 'Scene objects', exact: true });
  await browser.getByRole('button', { name: /^Select Book collection 2,/ }).click();
  const inspector = page.getByRole('region', { name: 'Object inspector', exact: true });
  await expect(inspector.getByRole('heading', { name: 'Book collection 2', exact: true })).toBeVisible();
  const originalX = await page.getByLabel('Position X', { exact: true }).inputValue();
  await inspector.getByRole('button', { name: 'Focus selected object', exact: true }).click();
  const canvas = page.locator('.scene-stage canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  // Camera focus places the object's center on the viewport center; wait for
  // the projected info card to reflect that camera update before clicking.
  await expect.poll(async () => page.locator('.scene-object-card').evaluate(element => Number.parseFloat((element as HTMLElement).style.left))).toBeCloseTo(bounds.width / 2, 0);
  await page.getByRole('button', { name: 'Clear object selection', exact: true }).click();
  await expect(inspector.getByRole('heading', { name: 'Book collection 2', exact: true })).toHaveCount(0);
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(inspector.getByRole('heading', { name: 'Book collection 2', exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(inspector.getByText('Hidden', { exact: true })).toBeVisible();
  await expect(page.locator('.scene-object-card')).toHaveCSS('visibility', 'hidden');
  await inspector.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(inspector.getByText('Visible', { exact: true })).toBeVisible();
  await expect(page.locator('.scene-object-card')).toHaveCSS('visibility', 'visible');
  const revisedX = String(Number(originalX) + 1.25);
  await page.getByLabel('Position X', { exact: true }).fill(revisedX);
  await page.getByLabel('Position X', { exact: true }).press('Enter');
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue(revisedX);
  await inspector.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue(originalX);
  await expect(inspector.getByText('Visible', { exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Remove added object', exact: true })).toHaveCount(0);
});

test('a malformed scenario file preserves the draft and minimal valid JSON receives safe defaults', async ({ page }) => {
  await openStudio(page);
  const originalName = `Protected browser draft ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Scenario name', exact: true }).fill(originalName);
  const input = page.getByLabel('Import scenario file', { exact: true });
  await input.setInputFiles({ name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{ this is not JSON') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Scenario name', exact: true })).toHaveValue(originalName);
  const importedName = `Minimal imported study ${Date.now()}`;
  await input.setInputFiles({ name: 'minimal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'komorebi-scene', version: 1, scenario: { name: importedName } })) });
  await expect(page.getByRole('textbox', { name: 'Scenario name', exact: true })).toHaveValue(importedName);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const saved = await saveScenario(page);
  expect(saved).toMatchObject({ name: importedName, description: '', objects: {}, additions: [], routes: [] });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Scenario name', exact: true })).toHaveValue(importedName);
  await expect(page.locator('.studio-scenario-name')).toContainText('Saved to workspace');
  await expect(page.getByText('This view could not load', { exact: true })).toHaveCount(0);
});
