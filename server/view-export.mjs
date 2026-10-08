// SPDX-License-Identifier: AGPL-3.0-only
import { buildViewReport } from '../shared/export-views.mjs';
import { buildViewPdf } from './view-pdf.mjs';
import { buildViewExcel } from './view-excel.mjs';
import { HttpError } from './validation.mjs';

export function installViewExportRoutes(app, { requireAuth, checkCsrf, getState, mode }) {
  let inFlight = 0;
  const protect = (req, _res, next) => { checkCsrf(req); next(); };
  app.post('/api/export/view-preview', requireAuth, protect, (req, res) => {
    res.json(buildViewReport(getState(), req.body, { mode }));
  });
  app.post('/api/export/view', requireAuth, protect, async (req, res) => {
    if (!req.body || !['pdf', 'xlsx'].includes(req.body.format)) throw new HttpError(400, 'Choose PDF or Excel as the export format.');
    if (inFlight >= 2) { res.setHeader('Retry-After', '5'); throw new HttpError(429, 'Document exports are busy. Please retry in a few seconds.'); }
    const { format, ...input } = req.body;
    inFlight++;
    try {
      const report = buildViewReport(getState(), input, { mode });
      const result = await (format === 'pdf' ? buildViewPdf(report) : buildViewExcel(report));
      if (result.buffer.length > 24 * 1024 * 1024) throw new HttpError(413, 'The document is too large. Export a smaller scope.');
      res.setHeader('Content-Type', result.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } finally { inFlight--; }
  });
}
