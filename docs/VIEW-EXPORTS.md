# PDF and Excel views · 守織 SHUORI

**Export views** produces documents designed for coordination, handover and printing. Choose a layout, review its saved-data preview, then download a PDF or an editable Excel workbook. These documents complement the complete [data workbooks](EXCEL-EXPORTS.md).

## Choose a view

| View | Layout | Typical use |
| --- | --- | --- |
| Volunteer timeline | People in rows, time across columns, with a labeled bar for each shift or event | Daily briefing, individual assignments, overlapping bookings and open positions |
| Station timeline | Service stations in rows, time across columns; activities occupy separate lanes when needed | Front-desk handover, location coverage and coordinating services in the same space |
| Weekly roster | People in rows, dates across columns, with activity times and occupied-hour totals | Reviewing a team's week and distributing a readable roster |
| Event agenda | Events in date/time order, with locations, participants and status | A programme for a selected period or the filtered event list |
| Event brief | Event facts, preparation, participant register and linked operational modules | Preparing and running a meeting, activity, training session or other custom event |

The event brief includes the saved description, coordinator, event type, status, dates, project and location. Where present, it also includes the meeting platform and agenda, participant attendance status and a blank sign-in/initials column, preparation checklist, linked service shifts, resources, document index and recorded activity. Custom event fields and coordination notes are optional. The document index identifies saved files; it does not embed their contents or access links.

## Create a document

1. Open **Export views** from Schedule, Events or the reporting area. Open an event workspace for its individual event brief.
2. Choose the document view and PDF or Excel. A launch from the event list preserves the matching event IDs across all list pages; an event brief uses the selected event's saved dates and status.
3. Set the dates, statuses and paper size. Scheduling views also offer a daily time window, a full-day option, scheduled events and unbooked rows. Timeline columns support 15, 30 or 60 minutes.
4. Review the preview and its notices. Longer previews sample the first rows or days; downloaded documents include the complete matching scope.
5. Download and review the resulting document before distributing it. Downloads read the latest saved state, so changes made after the preview can appear in the file.

Use **A4** for routine handouts and **A3** for dense schedules or wall displays. Long timelines are divided into panels of at most six hours. Excel at 15-minute resolution uses shorter panels on A4 to keep the time columns readable. Wider date ranges are divided into weekly roster sheets or pages.

Changes made to a downloaded workbook do not update SHUORI. Save staffing changes in the application and regenerate the document when it needs to represent the current schedule.

## Read times, staffing and review markers

All dates and times use **Asia/Tokyo (JST)**. Multi-day events are continuous intervals from their start date/time to their end date/time; they are not automatically interpreted as daily recurring sessions. Arrows identify activity segments that continue beyond a displayed day or time window. The complete activity register retains their original dates and times, including activities outside the selected visual time window.

**Occupied hours** count the union of non-cancelled activity intervals inside the selected time window. Both shifts and events occupy time; overlaps count once. Daily rows show that day's occupied hours. Weekly totals cover the selected date range, even when its roster spans several sheets. Totals repeated across time panels or roster sheets must not be added again. These figures are planning measures, not actual recorded volunteer hours or an eligibility decision.

Open places describe a shift's recorded staffing shortfall. Counts repeat where the same shift appears for several volunteers, so do not sum repeated assignment rows. An additional open-places row makes unassigned work visible. A station's occupied time does not by itself establish that every position is filled.

Overlap flags identify shared-volunteer time conflicts within the exported selection. Explicitly linked shift/event pairs are excluded. These flags do not replace the application's full eligibility checks, administrative readiness review, weekly limits or transfer-time allowance. A location showing several simultaneous activities does not automatically imply a volunteer conflict.

Status and review cues use both text and color. Excel uses `!` for overlap, `U` for open places, `D` for draft, `X` for cancelled and a check mark for completed. Conflict red and staffing amber take priority over the normal status color; markers can be combined. Cancelled items are struck through and contribute no occupied hours or open places. Event bars have a dashed top border.

## PDF output

PDFs use vector text and graphics, with an embedded Japanese font so Japanese names and the SHUORI wordmark remain selectable and searchable. Timeline and weekly views use landscape pages; event briefs and agendas use portrait pages. Long tables and prose continue over pages with repeated headings and page numbers.

The embedded Noto Sans JP font covers Japanese, Latin and the other characters supported by that font. PDF export rejects unsupported characters explicitly rather than replacing them with missing-glyph boxes; this can include emoji, Arabic or unsupported variation selectors. Use Excel when the content needs characters outside the PDF font's coverage.

PDF timeline bars use continuous, exact-minute positions. Compact bars may abbreviate titles or use references; the complete register supplies the full activity information. PDF generation does not require a desktop spreadsheet application or browser printing on the server. These files are not advertised as PDF/UA documents and do not contain interactive form fields or embedded attachments.

## Excel output

Visual Excel files are genuine `.xlsx` workbooks, with SHUORI aqua headers, frozen names and headings, wrapped text, repeating print titles and a defined print area. The first sheets present the selected view. Supporting sheets include:

- **Guide:** scope, interpretation, privacy, summary and review notices.
- **Item register:** stable references, complete source IDs and titles, typed dates and exact time cells, status and review flags.
- **Assignment register:** each activity/person assignment, station and staffing counts.
- **Row directory:** complete people or station labels, including idle rows, when relevant.
- **Coordination notes:** complete notes when explicitly selected.
- **Detail sheets:** the event modules or other supporting tables for the chosen view.

Excel bars fill every time cell touched by an activity: the start rounds down and the end rounds up to the selected interval. **The colored grid is an approximation.** Labels and registers preserve exact times. For example, 09:07–10:08 occupies the intersected 30-minute cells but remains 09:07–10:08 in its label and typed register cells.

Two consecutive activities can touch the same rounded cell without overlapping in real time. Excel places them on separate lanes so no bar is overwritten. A continuation lane alone does not mean there is a conflict; look for the explicit marker and review text.

Long register text is split into numbered `Part n/m` continuation rows to remain printable. Concatenate a field's parts in order without inserting a separator; the first identifying field may repeat to identify the record. No source text is discarded to fit a bar or row. Titles on visual bars can be shortened, with complete titles retained in the registers. Hours and counts stay numeric, dates/times use Excel date/time values, and Boolean custom fields remain Boolean values. User text beginning with `=`, `+`, `-`, `@` or a URL is exported as literal text, never as a formula or hyperlink object.

## Access and sensitive information

Signed-in users export within SHUORI's existing workspace read permissions. These views contain names and operational information; they exclude structured contact, emergency contact and administrative health fields, meeting access credentials and attachment contents. Meeting URLs, meeting IDs, passcodes and file access URLs are omitted from these views. This is a more limited sharing document than a complete administrative data workbook.

Coordination notes and custom fields are off by default. Descriptions, titles and meeting agendas are operational content and may still contain sensitive material entered by a user. Free text is not automatically redacted; review it and share downloaded files only with intended recipients. Downloaded files are outside the application's access controls.

## Scope and limits

Views accept up to **31 calendar days, 500 activities, 250 people, 8,000 displayed activity segments and 600,000 characters** in the normalized report. Dense or large requests receive an explicit error asking for a smaller selection. PDF output is limited to 240 pages and 16 MiB. Visual Excel output is limited to 400,000 written cells, 8,000,000 text characters and 16 MiB, in addition to Excel's per-cell text limit.

Empty scopes retain headings and a clear empty-state message. Excluded statuses or narrowed dates can change overlap detection and summary figures; the report only describes its selected scope. Occupancy and recorded activity are kept distinct.

## API and verification

`POST /api/export/view-preview` accepts a validated view request and returns the normalized report used by the interface. `POST /api/export/view` accepts the same request plus `"format": "pdf"` or `"format": "xlsx"`. Both operate on authenticated, saved server state and use the application's existing CSRF and origin protections.

```json
{
  "view": "volunteer-timeline",
  "format": "xlsx",
  "dateFrom": "2026-10-08",
  "dateTo": "2026-10-08",
  "timeFrom": "08:00",
  "timeTo": "18:00",
  "slotMinutes": 30,
  "paper": "A4",
  "includeEvents": true,
  "includeNotes": false,
  "includeCustomFields": false,
  "statuses": ["draft", "confirmed", "active", "completed"]
}
```

An event brief requires `eventId`. An event agenda can use exact `eventIds`; omitted IDs mean all matching events, while an empty array means an explicitly empty selection. Volunteer and location ID filters are available for other applicable views. The full typed request contract is in [`shared/export-views.d.mts`](../shared/export-views.d.mts).

A volunteer filter selects activities involving those people and narrows the timetable's person rows. The selected activities' complete co-assignee lists remain in the item and participant registers for coordination context; it is not a personal-data redaction filter. An agenda without explicit dates derives its date range from the selected statuses and events, then applies the 31-day limit. Agendas describe whole calendar days rather than a daily timetable window.

Synthetic examples of all five views are stored in [`artifacts/exports`](../artifacts/exports). Regenerate the Excel examples with `node scripts/capture-view-excel.mjs`; [`artifacts/qa/view-excel.json`](../artifacts/qa/view-excel.json) records hashes, sheet dimensions, time bands, print settings and the long-text fidelity checks. `node --test tests/view-excel.test.mjs` checks rounded collision lanes, exact typed times, multi-day events, empty scopes, literal formula-like text, Unicode and numbered continuation rows.
