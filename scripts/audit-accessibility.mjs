// SPDX-License-Identifier: AGPL-3.0-only
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const baseURL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3001';
const outputPath = resolve(process.env.AUDIT_OUTPUT || 'artifacts/qa/accessibility.json');
const routes = [
  ['dashboard', 'Overview'], ['projects', 'Projects & planning'], ['volunteers', 'Volunteers'],
  ['schedule', 'Schedule'], ['spatial', 'Spatial simulation'], ['records', 'Activity records'],
  ['support', 'Support & improvement'], ['resources', 'Resources'], ['reports', 'Reports & insights'],
  ['settings', 'Workspace settings'],
];
const report = {
  generatedAt: new Date().toISOString(), baseURL, viewport: { width: 1440, height: 1000 },
  browser: 'Installed Chrome via Playwright',
  tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
  scope: 'Main routes and selected operation forms in the built demo application. Automated results do not establish WCAG conformance; keyboard, screen-reader and spatial-scene interpretation require manual review.',
  engine: {}, routes: [], dialogs: [], pageErrors: [],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: report.viewport, locale: 'en-GB', timezoneId: 'Asia/Tokyo' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();

  async function audit(name, route, kind = 'route') {
    await page.evaluate(async () => { await document.fonts.ready; });
    const result = await new AxeBuilder({ page }).withTags(report.tags).analyze();
    report.engine = result.testEngine;
    const typography = await page.locator(kind === 'dialog' ? '[role="dialog"]' : '#main-content').evaluate(root => {
      const small = [...root.querySelectorAll('p,small,td,th,label,span,button,a,h1,h2,h3')]
        .filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height && el.textContent.trim() && !el.querySelector('p,small,td,th,label,button,h1,h2,h3'))
        .map(el => ({ text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 110), fontSize: parseFloat(getComputedStyle(el).fontSize), color: getComputedStyle(el).color, tag: el.tagName.toLowerCase() }))
        .filter(el => el.fontSize < 12);
      return { below12pxCount: small.length, examples: small.slice(0, 25) };
    });
    const entry = { name, route, url: page.url(), timestamp: result.timestamp, passes: result.passes.length, violations: result.violations, incomplete: result.incomplete, typography };
    report[kind === 'dialog' ? 'dialogs' : 'routes'].push(entry);
    console.log(`${kind} ${route}: ${result.violations.length} rules / ${result.violations.reduce((sum, rule) => sum + rule.nodes.length, 0)} affected nodes; ${typography.below12pxCount} text elements below 12px`);
    for (const violation of result.violations) console.log(`  ${violation.id} [${violation.impact}] ${violation.nodes.length} nodes`);
  }
  async function navigate(label) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: label, exact: false }).click();
    await page.locator('#main-content h1').waitFor();
  }
  for (const [route, label] of routes) {
    await navigate(label);
    await audit(label, route);
  }
  const forms = [
    ['volunteers', 'Volunteers', 'Add volunteer'], ['records', 'Activity records', 'Log activity'],
    ['support', 'Support & improvement', 'New request'], ['resources', 'Resources', 'Add resource'],
  ];
  for (const [route, label, trigger] of forms) {
    await navigate(label);
    await page.getByRole('button', { name: trigger, exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await audit(trigger, `${route}/create`, 'dialog');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  }
  await navigate('Workspace settings');
  await page.getByRole('tab', { name: 'Access & accounts', exact: true }).click();
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await audit('Create workspace account', 'settings/accounts/create', 'dialog');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const entries = [...report.routes, ...report.dialogs];
  report.summary = {
    viewCount: entries.length,
    viewsWithViolations: entries.filter(entry => entry.violations.length).length,
    ruleOccurrences: entries.reduce((sum, entry) => sum + entry.violations.length, 0),
    affectedNodeOccurrences: entries.reduce((sum, entry) => sum + entry.violations.reduce((count, rule) => count + rule.nodes.length, 0), 0),
    uniqueRules: [...new Set(entries.flatMap(entry => entry.violations.map(rule => rule.id)))],
    incompleteRuleOccurrences: entries.reduce((sum, entry) => sum + entry.incomplete.length, 0),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Saved ${outputPath}`);
  console.log(JSON.stringify(report.summary));
} finally {
  await browser.close();
}
