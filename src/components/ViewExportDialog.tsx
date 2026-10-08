// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useId, useState } from 'react';
import { CalendarDays, Check, Clock3, Download, FileSpreadsheet, FileText, LayoutList, LoaderCircle, MapPin, ShieldCheck, Users } from 'lucide-react';
import { downloadExportView, previewExportView } from '../api';
import type { PageProps } from '../types';
import type { ExportView, ReportTable, ViewExportRequest, ViewReport } from '../../shared/export-views.mjs';
import { Field, Modal, formatDate, statusLabel } from './UI';
import './ViewExportDialog.css';

const VIEWS = [
  { id: 'volunteer-timeline', title: 'Volunteer timeline', description: 'People in rows, time across the day', icon: Users },
  { id: 'station-timeline', title: 'Station timeline', description: 'Service locations and staffing gaps', icon: MapPin },
  { id: 'weekly-roster', title: 'Weekly roster', description: 'People, dates and occupied hours', icon: CalendarDays },
  { id: 'event-agenda', title: 'Event agenda', description: 'A chronological programme to share', icon: LayoutList },
  { id: 'event-brief', title: 'Event brief', description: 'The plan, preparation and participants', icon: FileText },
] as const;
const DEFAULT_STATUSES: NonNullable<ViewExportRequest['statuses']> = ['draft', 'confirmed', 'active', 'completed'];
const ALL_STATUSES: NonNullable<ViewExportRequest['statuses']> = [...DEFAULT_STATUSES, 'cancelled'];
const minuteLabel = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

type Props = { request: ViewExportRequest; scope: string; notify: PageProps['notify']; label?: string };

/** A small launcher shared by Schedule, Events and the reporting hub. */
export default function ViewExportButton({ request, scope, notify, label = 'Export views' }: Props) {
  const [open, setOpen] = useState(false); const descriptionId = useId();
  return <><button type="button" className="button button-secondary view-export-button" aria-describedby={descriptionId} onClick={() => setOpen(true)}><FileText size={15} aria-hidden />{label}</button><span id={descriptionId} className="sr-only">PDF or Excel. {scope}</span>{open && <ViewExportDialog request={request} scope={scope} notify={notify} onClose={() => setOpen(false)} />}</>;
}

function PreviewTable({ table }: { table: ReportTable }) {
  return <section><h5 className="view-export-section-title">{table.title}</h5><div className="view-export-scroll" tabIndex={0} role="region" aria-label={`${table.title} preview table`}><table className="view-export-table"><thead><tr>{table.columns.map((column, index) => <th key={`${column}-${index}`} scope="col">{column}</th>)}</tr></thead><tbody>{table.rows.length ? table.rows.slice(0, 8).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell === null ? '—' : typeof cell === 'boolean' ? cell ? 'Yes' : 'No' : cell}</td>)}</tr>) : <tr><td colSpan={table.columns.length}>No matching records.</td></tr>}</tbody></table></div>{table.rows.length > 8 && <p className="view-export-preview-note">Preview: first 8 of {table.rows.length} rows. The download includes every row.</p>}{table.note && <p className="view-export-preview-note">{table.note}</p>}</section>;
}

function ReportPreview({ report }: { report: ViewReport }) {
  const span = report.range.endMinute - report.range.startMinute;
  const ticks = Array.from({ length: 5 }, (_, index) => report.range.startMinute + Math.round(span * index / 4));
  const day = report.timelines[0];
  return <article className="view-export-paper" aria-label="Saved report preview">
    <header className="view-export-paper-head"><div><span className="view-export-wordmark">守織 SHUORI</span><h4>{report.title}</h4><p>{report.subtitle}</p></div><span className="view-export-paper-status">{report.paper} · JST{report.mode === 'demo' ? ' · DEMO' : ''}</span></header>
    <div className="view-export-stats">{report.summary.map(item => <span key={item.label}><strong>{item.value}</strong> {item.label}</span>)}</div>
    {day && <section><h5 className="view-export-section-title">{formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</h5><div className="view-export-scroll" tabIndex={0} role="region" aria-label="Time across the day preview"><div className="view-export-timeline"><div className="view-export-timeline-head"><strong>{report.view === 'station-timeline' ? 'STATION' : 'VOLUNTEER'}</strong><div className="view-export-time-scale">{ticks.map((tick, index) => <span key={index}>{minuteLabel(tick)}</span>)}</div></div>{day.rows.slice(0, 8).map(row => <div className="view-export-timeline-row" key={row.id}><div className="view-export-row-label"><strong>{row.label}</strong><small>{row.detail || `${row.hours} occupied hours`}</small></div><div className="view-export-lane" style={{ minHeight: Math.max(1, row.lanes.length) * 42 + 5 }}>{row.lanes.flatMap((lane, laneIndex) => lane.map(bar => <div key={bar.key} className={`view-export-bar ${bar.kind === 'event' ? 'event' : ''} ${bar.status === 'cancelled' ? 'cancelled' : ''} ${bar.conflict ? 'conflict' : ''}`} style={{ left: `${(bar.startMinute - report.range.startMinute) / span * 100}%`, width: `${(bar.endMinute - bar.startMinute) / span * 100}%`, top: 5 + laneIndex * 42 }} title={`${bar.title} · ${bar.start}–${bar.end} · ${bar.location}${bar.conflict ? ' · Overlapping booking' : ''}`}><strong>{bar.clippedStart ? '← ' : ''}{bar.title}{bar.clippedEnd ? ' →' : ''}</strong><small>{bar.start}–{bar.end}{bar.openPlaces ? ` · ${bar.openPlaces} open` : ''}</small></div>))}</div></div>)}</div></div>{!day.rows.length && <p className="view-export-preview-note">No matching assignments on this day.</p>}{(day.rows.length > 8 || report.timelines.length > 1) && <p className="view-export-preview-note">Preview: {Math.min(day.rows.length, 8)} rows on the first of {report.timelines.length} days. Every matching day and row is included in the download.</p>}</section>}
    {report.weekly.length > 0 && <section><h5 className="view-export-section-title">People × dates</h5><div className="view-export-scroll" tabIndex={0} role="region" aria-label="Weekly roster preview"><table className="view-export-table"><thead><tr><th scope="col">Volunteer</th>{report.days.slice(0, 7).map(date => <th scope="col" key={date}>{formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</th>)}<th scope="col">Occupied h</th></tr></thead><tbody>{report.weekly.slice(0, 6).map(row => <tr key={row.id}><th scope="row">{row.label}</th>{row.cells.slice(0, 7).map(cell => <td key={cell.date}>{cell.items.length ? cell.items.map(item => `${item.start}–${item.end}\n${item.title}`).join('\n\n') : '—'}</td>)}<td>{row.totalHours}</td></tr>)}</tbody></table></div>{(report.weekly.length > 6 || report.days.length > 7) && <p className="view-export-preview-note">Preview: first 6 people and 7 dates. The download includes the full selected period.</p>}</section>}
    {report.event && <section><h5 className="view-export-section-title">{report.event.title}</h5><p className="view-export-preview-note" style={{ whiteSpace: 'pre-wrap', color: '#365565' }}>{report.event.description || 'No description recorded.'}</p><dl className="view-export-event-facts">{report.event.metadata.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value || '—'}</dd></div>)}</dl></section>}
    {report.tables.slice(0, report.view === 'event-brief' ? 5 : 2).map((table, index) => <PreviewTable key={`${table.title}-${index}`} table={table} />)}
    {report.tables.length > (report.view === 'event-brief' ? 5 : 2) && <p className="view-export-preview-note">Additional detail tables are included in the download.</p>}
    {!report.items.length && !report.event && <div className="view-export-empty"><CalendarDays size={25} aria-hidden /><strong>No activities in this scope</strong><p>Adjust dates or statuses, or download this view as a clearly marked empty report.</p></div>}
    <p className="view-export-preview-note">{report.privacy}</p>
  </article>;
}

export function ViewExportDialog({ request: initialRequest, scope, notify, onClose }: Props & { onClose: () => void }) {
  const [request, setRequest] = useState<ViewExportRequest>({ timeFrom: '08:00', timeTo: '18:00', slotMinutes: 30, paper: 'A4', includeEvents: true, includeIdle: false, includeNotes: false, includeCustomFields: false, statuses: DEFAULT_STATUSES, ...initialRequest });
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf'); const [report, setReport] = useState<ViewReport | null>(null);
  const [previewError, setPreviewError] = useState(''); const [downloadError, setDownloadError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0); const [readyKey, setReadyKey] = useState('');
  const previewId = useId();
  const serialized = JSON.stringify(request); const ready = readyKey === serialized && !!report && !loading && !previewError;
  const brief = request.view === 'event-brief'; const timeline = request.view.endsWith('-timeline'); const scheduling = timeline || request.view === 'weekly-roster';
  const availableViews = VIEWS.filter(view => initialRequest.eventId ? view.id === 'event-brief' : initialRequest.eventIds !== undefined ? view.id === 'event-agenda' : view.id !== 'event-brief');
  const allDay = request.timeFrom === '00:00' && request.timeTo === '24:00';
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setPreviewError(''); setDownloadError('');
    const timer = window.setTimeout(() => { void previewExportView(JSON.parse(serialized) as ViewExportRequest, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setReport(value); setReadyKey(serialized); setLoading(false);
    }).catch(error => { if (!controller.signal.aborted) { setPreviewError(error instanceof Error ? error.message : 'The preview could not be loaded.'); setLoading(false); } }); }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [serialized, revision]);
  function update(patch: Partial<ViewExportRequest>) { setRequest(current => ({ ...current, ...patch })); setDownloadError(''); }
  async function download() {
    if (!ready || busy) return;
    setBusy(true); setDownloadError('');
    try { const filename = await downloadExportView(report!.request, format); notify(`${format === 'pdf' ? 'PDF' : 'Excel'} view downloaded: ${filename}`); }
    catch (error) { setDownloadError(error instanceof Error ? error.message : 'The document could not be downloaded.'); }
    finally { setBusy(false); }
  }
  return <Modal title="Export views" onClose={() => !busy && onClose()} wide><div className="view-export-studio">
    <div className="view-export-intro"><div><strong>A clear plan, ready to share.</strong><p>Choose a view for the people who will use it. Preview the saved workspace, then download a carefully laid out PDF or an editable Excel workbook.</p><button type="button" className="text-button view-export-mobile-jump" onClick={() => { const element = document.getElementById(previewId); element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: 'start' }); }}>Preview document <FileText size={13} aria-hidden /></button></div><span className="view-export-jst"><Clock3 size={13} aria-hidden />Japan time</span></div>
    <fieldset className={`view-export-choices ${availableViews.length === 1 ? 'single' : ''}`} disabled={busy}><legend>Document view</legend>{availableViews.map(view => <button key={view.id} type="button" aria-pressed={request.view === view.id} className={`view-export-choice ${request.view === view.id ? 'active' : ''}`} onClick={() => update({ view: view.id as ExportView })} title={view.description}><span className="view-export-choice-icon"><view.icon size={19} aria-hidden />{request.view === view.id && <Check size={14} aria-hidden />}</span><strong>{view.title}</strong><small>{view.description}</small></button>)}</fieldset>
    <div className="view-export-layout"><aside className="view-export-settings" aria-label="Export settings"><fieldset disabled={busy} className="plain-fieldset">
      <fieldset className="view-export-format"><legend>File format</legend><label><input type="radio" name="view-export-format" value="pdf" checked={format === 'pdf'} onChange={() => setFormat('pdf')} /><FileText size={20} aria-hidden /><strong>PDF</strong><small>Print & share</small></label><label><input type="radio" name="view-export-format" value="xlsx" checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} /><FileSpreadsheet size={20} aria-hidden /><strong>Excel</strong><small>Edit & coordinate</small></label></fieldset>
      <h3>Scope & layout</h3><div className="view-export-scope"><strong>Starting context</strong><br />{scope}{initialRequest.eventIds && scheduling && <><br />All matching saved shifts are included; events remain limited to this selection.</>}{brief && <><br />Uses the selected event's saved dates and status.</>}</div>
      {!brief && <><div className="field-grid"><Field label="From date"><input type="date" value={request.dateFrom || ''} onChange={event => update({ dateFrom: event.target.value || undefined })} /></Field><Field label="Through date"><input type="date" value={request.dateTo || ''} onChange={event => update({ dateTo: event.target.value || undefined })} /></Field></div><p className="view-export-preview-note" style={{ marginTop: -6, marginBottom: 14 }}>Up to 31 days. {request.view === 'event-agenda' ? "Leave both blank to use the selected events' dates." : 'Leave both blank to use today.'}</p></>}
      {scheduling && <><label className="view-export-check"><input type="checkbox" checked={allDay} onChange={event => update(event.target.checked ? { timeFrom: '00:00', timeTo: '24:00' } : { timeFrom: '08:00', timeTo: '18:00' })} /><span>Full day · 00:00–24:00<small>Include early, late and overnight bookings.</small></span></label><div className="field-grid"><Field label="Day starts (JST)"><input type="time" disabled={allDay} value={request.timeFrom || '08:00'} onChange={event => update({ timeFrom: event.target.value })} /></Field><Field label="Day ends (JST)">{allDay ? <input type="text" readOnly value="24:00" /> : <input type="time" value={request.timeTo || '18:00'} onChange={event => update({ timeTo: event.target.value })} />}</Field></div></>}
      <div className="field-grid"><Field label="Paper size"><select value={request.paper} onChange={event => update({ paper: event.target.value as 'A4' | 'A3' })}><option value="A4">A4 · standard</option><option value="A3">A3 · wall display</option></select></Field>{timeline && <Field label="Time columns"><select value={request.slotMinutes} onChange={event => update({ slotMinutes: Number(event.target.value) as 15 | 30 | 60 })}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option></select></Field>}</div>
      {!brief && <fieldset className="view-export-statuses"><legend>Included statuses</legend>{ALL_STATUSES.map(status => <label key={status}><input type="checkbox" checked={request.statuses?.includes(status) || false} onChange={event => update({ statuses: event.target.checked ? [...(request.statuses || []), status] : request.statuses?.filter(value => value !== status) })} />{statusLabel(status)}</label>)}</fieldset>}
      {scheduling && <><label className="view-export-check"><input type="checkbox" checked={request.includeEvents} onChange={event => update({ includeEvents: event.target.checked })} /><span>Include scheduled events<small>Place meetings and other events alongside shifts.</small></span></label><label className="view-export-check"><input type="checkbox" checked={request.includeIdle} onChange={event => update({ includeIdle: event.target.checked })} /><span>Include unbooked rows<small>Show people or stations with no booking.</small></span></label></>}
      <label className="view-export-check"><input type="checkbox" checked={request.includeNotes} onChange={event => update({ includeNotes: event.target.checked })} /><span>Include operational notes<small>Review free text before sharing outside the team.</small></span></label>
      {brief && <label className="view-export-check"><input type="checkbox" checked={request.includeCustomFields} onChange={event => update({ includeCustomFields: event.target.checked })} /><span>Include event custom fields<small>Only the selected event's extra fields.</small></span></label>}
      <div className="view-export-privacy"><ShieldCheck size={15} aria-hidden /><span>Names and operational details are included. Contact, emergency and health records, meeting access credentials and attachment contents are excluded.</span></div>
    </fieldset></aside><section id={previewId} tabIndex={-1} className="view-export-preview-area" aria-label="Document preview"><div className="view-export-preview-top"><h3>Document preview</h3><span role="status">{loading ? <><LoaderCircle size={13} className="spin" aria-hidden />Updating…</> : previewError ? 'Preview unavailable' : <><Check size={13} aria-hidden />Saved workspace</>}</span></div>
      {previewError ? <div className="view-export-paper view-export-empty"><FileText size={26} aria-hidden /><strong>Review the export settings</strong><p role="alert">{previewError}</p><button className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Retry preview</button></div> : loading || readyKey !== serialized ? <div className="view-export-paper view-export-empty"><LoaderCircle size={24} className="spin" aria-hidden /><strong>Preparing your view</strong><p>Reading the saved schedule and arranging the report.</p></div> : report && <ReportPreview report={report} />}
      {ready && report!.warnings.length > 0 && <div className="view-export-warnings" aria-label="Report notices">{report!.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
      <p className="view-export-preview-note">The preview samples longer reports. Downloads contain the complete matching scope, repeated headers and page breaks. PDF timeline bars use exact times; Excel bars fill the selected time columns and list exact times in the details.</p>
    </section></div>
    {downloadError && <p className="view-export-error" role="alert">{downloadError}</p>}
    <footer className="view-export-footer"><p>Exports use the latest saved records at download time. Review the scope and notices before sharing.</p><div><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Close</button><button type="button" className="button button-primary" disabled={!ready || busy} aria-busy={busy} onClick={() => void download()}>{busy ? <LoaderCircle size={15} className="spin" aria-hidden /> : <Download size={15} aria-hidden />}{busy ? 'Preparing document…' : `Download ${format === 'pdf' ? 'PDF' : 'Excel'}`}</button></div></footer>
  </div></Modal>;
}
