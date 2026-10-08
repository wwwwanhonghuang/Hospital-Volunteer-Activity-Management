# Excel exports · 守織 SHUORI 1.2

Excel actions download genuine `.xlsx` workbooks with blue headers, wrapped text, typed values, frozen headings, filters and A4 landscape print settings. Every workbook begins with **Overview**, which lists its worksheets, data-row counts and interpretation notes. Rows 1–4 show the title, generation time in Japan Standard Time, scope and notes; row 5 contains column headings, and data begins on row 6.

## Choose the appropriate workbook

| Export | Worksheets and purpose |
| --- | --- |
| Volunteers | **Volunteers**: contacts, programme lifecycle, skills, languages, availability, training and administrative clearance. Supports recruitment, onboarding and volunteer coordination. |
| Readiness | **Readiness summary**, **Readiness**, **Readiness follow-ups**: administrative review as of the selected date. Clearance is current through its due date, inclusive. Archived volunteers are excluded from the follow-up list. |
| Projects | **Projects**, **Tasks and CPM**, **Task dependencies** for the selected projects. Includes ownership, goals, risks, dates and JPY budget figures. |
| Project plan | **Project plan summary**, **Projects**, **Tasks and CPM**, **Task dependencies**, **Shifts**, **Assignment roster** for one project. Supports event preparation and coordination. |
| Tasks | **Tasks and CPM**, **Task dependencies**. Even when task rows are filtered, CPM values use each task's complete project graph. |
| Schedule / shifts | **Shifts**, **Assignment roster**: one row per shift and one per volunteer/shift assignment, with locations, staffing gaps, times and eligibility review. |
| Activity records | **Activity records**: actual hours, service interactions, category and linked volunteer/shift details. |
| Monthly report | **Monthly summary**, **Participation**, **Recognition planning**, **Service categories**, **Six month trend**, **Activity records**, **Shifts**, **Assignment roster**. Totals match the monthly report definitions. |
| Support requests | **Support requests**: consultation, service improvement, incident follow-up and departmental coordination. |
| Resources | **Resources**: inventory quantities, availability, locations, inspections and maintenance status. |
| Spatial scenarios | **Scenarios**, **Scene object overrides**, **Scene additions**, **Scene routes**, **Route points**. Geometry and routes are normalized into individual rows with stable references and point sequence numbers. |
| Locations | **Locations**: installed service-station references, floors, buildings, capacity assumptions and source notes. |
| Workspace | All operational worksheets above, without the specialized monthly, readiness or project-plan summaries. User accounts, credentials, sessions and audit logs are excluded. |

Monthly volunteer hours and interactions come from submitted activity records. Participating volunteers and recorded shifts are distinct IDs within those records. The completed-shift denominator includes all non-cancelled shifts in the month, including drafts. Recognition planning includes every recorded participant, sorted by hours and name; it applies no automatic award threshold or assessment of contribution quality. The trend covers the selected month and the previous five months.

Administrative readiness requires an active programme status, completed training, cleared administrative status and a current review date. The workbook does not contain a clinical result model. Actual assignment eligibility also depends on skills, availability, workload and conflicts. Completed or cancelled shifts retain historical assignments without applying current readiness retroactively.

## Scope and saved data

Exports read the saved server state when requested. Page exports can supply the exact IDs currently visible after filtering. Their order is retained. **An empty selection produces header-only worksheets**, not a fallback to the full collection. Missing or duplicate IDs return a validation error so that a stale selection cannot silently change scope.

Related worksheets follow the primary scope: selected projects bring their tasks; selected shifts bring their assignments; selected scenarios bring their objects and route points. A task's CPM uses the complete parent project even when only selected task rows are exported. A date-filtered schedule refuses selected IDs from another date.

Spatial Excel exports include **saved scenarios only**. Unsaved scene edits and route drafts remain in the browser until saved. Scenario JSON is the portable editing format; Excel is a tabular review of saved scenario data. Exporting never modifies the schedule, scenarios or other records.

The workbook is a snapshot, not a live link or an import/restore file. Subsequent changes in Excel do not update SHUORI. Use the administrator JSON backup for operational recovery; keep existing CSV exports when a flat interchange file is more suitable.

## Types, formulas and dates

- IDs, phone numbers, email addresses and user-entered text remain strings. Leading zeros and Japanese Unicode are preserved.
- Text beginning with `=`, `+`, `-`, `@` or a URL remains literal text. The exporter does not create formula or hyperlink objects from user content.
- Hours, counts, amounts, percentages and coordinates are numeric cells; visibility and readiness flags are Boolean cells. JPY fields use a yen currency format.
- Civil dates use Excel date cells formatted `yyyy-mm-dd`. Times use numeric Excel time cells formatted `hh:mm`. Created/updated timestamps are converted to JST for display, and the generation timestamp explicitly says JST.
- Calculations are exported as numeric snapshot results. They do not recompute when cells are edited.
- Oversized text is rejected with an explicit error; it is never silently truncated to fit Excel.

## Access and limits

Signed-in administrators, coordinators and viewers may export data within the application's existing full-workspace read permissions. The endpoint requires the current session's CSRF token and enforces the application's origin check. Export requests do not create operational audit entries. Treat downloaded files with the same access restrictions as their source records.

Each workbook is limited to **30,000 data rows across all sheets, 400,000 data cells, 8,000,000 text characters and a 16 MiB output file**. Overview index rows count toward those totals. Excel's **32,767-character cell limit** is enforced. Up to **10,000 explicit IDs** may be requested. The server allows at most two Excel exports in progress; a busy response asks the client to retry. Use narrower filters if an export reaches a limit.

## API contract

`POST /api/export/xlsx` returns MIME type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with an attachment filename such as `shuori-monthly-report-2026-10-08.xlsx`.

```json
{
  "kind": "volunteers",
  "ids": ["vol-1", "vol-2"],
  "date": "2026-10-08",
  "scopeLabel": "Active volunteers visible in this view"
}
```

`kind` accepts `volunteers`, `projects`, `tasks`, `shifts`, `records`, `requests`, `resources`, `scenarios`, `locations`, `workspace`, `monthly-report`, `readiness`, `project-plan` or `schedule`. `monthly-report` requires `month` in `YYYY-MM` format; `project-plan` requires `projectId`. Those two kinds and `workspace` do not accept `ids`. `date` is supported for `schedule`, `shifts`, `volunteers` and `readiness`. `scopeLabel` adds a descriptive label, while actual scope is controlled by the validated IDs/date/month/project parameters.

Generation is implemented in `server/excel-export.mjs`. `tests/excel-export.test.mjs` reads generated files back through ExcelJS and checks scope, Unicode, literal text, cell types, report totals, project calculations, normalized scenarios, access controls and empty exports.
