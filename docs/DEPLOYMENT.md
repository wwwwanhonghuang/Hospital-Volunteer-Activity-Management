# Running and operating 守織 SHUORI

SHUORI is a general-purpose hospital volunteer coordination application developed independently as a personal project, with no affiliation to any particular hospital, university or organization. The bundled floor reconstruction is an illustrative demo with [documented external sources](FLOOR-SOURCES.md), not an official facility model. Deployment requires the operator's own location data, programme rules and acceptance review.

## Prerequisites

Use Node.js 22.13 or newer, npm, and a current browser with WebGL support for the 3D view. The implementation was tested on Node.js 22.17 on Windows. This Node release prints an experimental warning for its built-in SQLite module; it is not a startup failure.

Run commands from the repository root. The PowerShell examples use `npm.cmd` because a machine's execution policy may block `npm.ps1`. Use `npm` instead on macOS or Linux. The API reads environment variables supplied by the shell or process manager; it does not automatically load a `.env` file. The frontend build uses Vite's environment handling; variables prefixed with `VITE_` are browser-visible and must not contain secrets.

## Local demonstration

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open `http://127.0.0.1:3001`. Use the demo sign-in controls. Demo accounts have administrator, coordinator and viewer roles; the demonstration credentials are not production passwords. All seeded profiles, contact addresses, activity records and requests are fictional.

The first demo start creates `data/demo.sqlite`. Restarting preserves edits and does not regenerate seed data. Seeding uses the current date in Asia/Tokyo. Set `DEMO_DATE` before the first start to make a demonstration reproducible:

```powershell
$env:DEMO_DATE = '2026-10-08'
npm.cmd start
```

Changing `DEMO_DATE` does not reset an existing database. To create another disposable demonstration, use a new database path:

```powershell
$env:DATABASE_PATH = Join-Path $PWD 'data/demo-review.sqlite'
npm.cmd start
```

For development, `npm.cmd run dev` runs the API on port 3001 and Vite on `http://127.0.0.1:5173`, with API requests proxied to port 3001. Keep the default API port for this command unless you also update the Vite proxy configuration. Production runs the compiled interface and API together; Vite is not needed at runtime.

## Upgrade to SHUORI 1.3

Download a backup, stop the running service, preserve its configured database and backup location, install dependencies with `npm.cmd ci`, rebuild, and restart with the same environment. Startup adds the `attachment_blobs` table if it does not exist. Events, event types, field definitions, journal entries and attachment metadata use the existing entity table. New optional volunteer/activity fields receive schema defaults when read. Existing records are preserved, and existing demo databases are not reseeded with new examples. Use a new disposable database path if you want the full 1.3 demo dataset.

Create event types and custom field definitions in the interface when upgrading an existing workspace; a production workspace is not populated with demonstration definitions. Existing Docker service/volume keys and calendar event IDs remain stable. `Start-SHUORI.cmd` is the Windows launcher; the earlier launcher remains a compatibility wrapper. There is no general schema migration framework. Preserve the pre-upgrade database if rollback is needed; an older application version does not understand the new collections or file-bearing backups.

New JSON exports use `shuori-backup` and `shuori-scene`. Legacy `komorebi-backup` and `komorebi-scene` files remain readable. Excel exports are reporting snapshots and cannot replace a restorable backup. Their controls and limits are documented in [Excel exports](EXCEL-EXPORTS.md).

## Production bootstrap

Production mode creates empty operational collections. It requires an initial administrator password containing at least fourteen characters, uppercase and lowercase letters, a number and a symbol. No demo sign-in endpoint is available in production.

Build first, then configure a persistent local database path and the externally visible HTTPS origin. The domain below is an example to replace with the organization's actual hostname.

```powershell
npm.cmd ci
npm.cmd run build
$env:APP_MODE = 'production'
$env:DATABASE_PATH = Join-Path $PWD 'data/production.sqlite'
$env:HOST = '127.0.0.1'
$env:PORT = '3001'
$env:APP_ORIGIN = 'https://volunteers.example.internal'
$env:TRUST_PROXY = '1'
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Initial administrator password' -AsSecureString)).Password
npm.cmd start
```

The bootstrap username is `admin`. After the database has been initialized, `ADMIN_PASSWORD` is no longer required at startup and does not change an existing password. Remove it from the service configuration after bootstrap. Change existing passwords using the administrator account-management API or the account controls provided by the interface.

Serve the public origin through an HTTPS reverse proxy. The proxy should connect to the loopback listener, preserve the public Host header, replace untrusted forwarded headers, and supply the correct forwarded protocol. `TRUST_PROXY=1` trusts exactly one proxy hop. Production cookies are always Secure by default, so accessing production directly over ordinary HTTP will not provide a functioning authenticated browser session. This is deliberate; use HTTPS at the public origin.

Run the process through the organization's service manager, under a dedicated operating-system account with access limited to the application and its persistent data. Do not use multiple worker processes against the same database. Keep the database on a local filesystem, not a network share. The service must be restarted after replacing a build.

## License and source offer

The software is **AGPL-3.0-only**. The interface's **Source code** link uses the release source URL in [`SoftwareNotice.tsx`](../src/components/SoftwareNotice.tsx), unless overridden at build time. Verify that this URL identifies the source of the version you deploy. When deploying a modified version for users to interact with over a network, prominently offer those users its actual Corresponding Source at no charge. Include the required source and material needed to build, install, run and modify that version. An unchanged upstream link does not provide the source of your local modifications. See [licensing and attribution](LICENSING.md) and AGPL Sections 1 and 13 in [LICENSE](../LICENSE).

Set **`VITE_SOURCE_URL` before building** to point to an accessible source archive or an exact commit/tag containing the deployed version. Replace the example URL below with your published source location; never include credentials, access tokens or private record data in it. The URL is embedded in the browser bundle and visible to everyone who loads the application.

```powershell
$env:VITE_SOURCE_URL = 'https://git.example.org/volunteer-team/shuori/tree/deployed-version'
npm.cmd run build
```

On macOS/Linux, use `VITE_SOURCE_URL='https://git.example.org/volunteer-team/shuori/tree/deployed-version' npm run build`. Changing this variable only when starting the API does not change an already compiled interface. For a custom container build, pass the value into the frontend build stage. Check the deployed link from a user's browser after every release and keep the corresponding version available. Do not put volunteer databases, credentials or backups into the source archive.

The supplied model descriptions, artwork and documentation are separately licensed under **CC BY-NC-SA 4.0**. Their noncommercial, attribution and ShareAlike conditions apply to those materials; AGPL itself permits commercial software use. You may replace the creative assets with suitably licensed content when adapting the software. Preserve the documented schema or migrate saved object references; see [replaceable content](../content/README.md) and the [license path map](../LICENSES/README.md).

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `APP_MODE` | `demo` | `demo` or `production`; stored in database metadata |
| `DATABASE_PATH` | `data/<mode>.sqlite` | SQLite file path, relative to the working directory if not absolute |
| `HOST` | `127.0.0.1` | HTTP listener address |
| `PORT` | `3001` | HTTP listener port |
| `APP_ORIGIN` | Request origin derived from protocol and Host | Expected browser origin; explicitly set the production HTTPS origin without a trailing slash |
| `TRUST_PROXY` | Disabled | Set exactly `1` when running behind one trusted reverse proxy |
| `ADMIN_PASSWORD` | None | Initial production administrator password; only used when creating the first administrator |
| `DEMO_DATE` | Today's date in Asia/Tokyo | Synthetic-data anchor, `YYYY-MM-DD`; used only when creating a demo database |
| `VITE_SOURCE_URL` | Release source URL in `src/components/SoftwareNotice.tsx` | **Frontend build time only**; public link to the deployed version's Corresponding Source; never include credentials |

The API refuses to open a database whose stored mode differs from `APP_MODE`. Do not point production at a demonstration database. Application data, browser-visible dates and passwords should not be placed in source-control configuration files.

## Accounts and access

Administrators can create accounts through `POST /api/users` with `username`, `name`, `role` and `password`. Usernames accept 3–50 letters, digits, underscores, dots or hyphens. Roles are `admin`, `coordinator` and `viewer`. Passwords must satisfy the bootstrap strength rule.

`PUT /api/users/:id` accepts `name`, `role` and/or `password`. Any account update invalidates its existing sessions. The last administrator cannot be demoted. There is no account deletion, public sign-up or self-service email recovery. Keep at least two authorized administrators when organizational policy permits, and maintain a secure recovery procedure outside this application.

Sessions last twelve hours, and logging out invalidates the current session. A process restart preserves unexpired sessions. Sign-in is limited to twenty attempts per IP address per fifteen minutes; successful and unsuccessful attempts both count. The rate-limit store is process-local and resets on restart. In front of a reverse proxy, configure forwarding correctly so different users are not all counted as the proxy itself.

All signed-in roles can view volunteer contact details, clearance status, event meeting details and attached files. There is no department-, event- or field-level partitioning. Event participant lists do not restrict who can read an event or its files. Coordinators manage operations, field definitions, event types and uploads; administrators additionally manage accounts and full backups. Match account access to the organization's information-handling policy.

## Files, shared documents and meetings

The local file provider stores uploaded bytes in the SQLite database alongside their metadata. The configured database path is the complete application storage location; there is no public upload directory or separate file service to configure. File download requests require a signed-in account and return an attachment, not an inline preview. The UI exposes usage under **Settings → File storage**; `GET /api/storage` reports the same provider, counts and limits.

| Limit | Value |
| --- | --- |
| Maximum single file | 10 MiB (10,485,760 bytes), non-empty |
| Total uploaded file bytes | 250 MiB per workspace |
| Files and external links per parent record | 200 |
| Allowed extensions | `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`, `.csv`, `.png`, `.jpg`, `.jpeg`, `.webp` |

These limits are code constants in `server/attachments.mjs`, not environment settings. Uploads use `application/octet-stream`; the existing 1 MiB JSON request limit does not apply to file bodies. Configure the HTTPS proxy to accept requests of at least 10 MiB on the upload endpoint. Proxy timeouts and response handling must also accommodate authenticated file downloads and larger backups. A proxy rejection may happen before the application can display its own error message.

The server checks filenames, allowed extensions and basic file signatures, records its own SHA-256 hash, and enforces storage limits inside the upload transaction. It does not perform antivirus scanning or guarantee that an Office/PDF document is safe to open. Apply the organization's document-handling controls. Uploaded bytes, database pages and backups are not encrypted by SHUORI. The 250 MiB limit counts active file bytes, not total SQLite/WAL size; removed files can leave reusable database pages, and audit/operational records add further disk use. Monitor free disk space separately.

An event, profile, shift, activity record or journal entry may instead store an external HTTPS file/folder link. The link is opened at its provider; SHUORI does not retrieve its contents, grant cloud permissions or include the remote file in a backup. Google Drive and other providers retain their own access controls. Meeting modules likewise open an existing Zoom, Google Meet, Teams or other HTTPS join URL. There is no Google OAuth, direct Google Cloud Storage backend, Drive synchronization, calendar synchronization, meeting creation API or recording retrieval in this release. No provider credentials are needed for saved links. See [Events and records](EVENTS-AND-RECORDS.md) for the operational workflows.

## Backups

Administrators can download an operational JSON backup from the interface or `GET /api/backup`. The command below writes the same format from the configured database:

```powershell
$env:APP_MODE = 'production'
$env:DATABASE_PATH = Join-Path $PWD 'data/production.sqlite'
node scripts/backup.mjs
```

By default, the script writes a timestamped file under `backups/`. Provide a destination to choose a specific filename:

```powershell
node scripts/backup.mjs 'backups/production-before-upgrade.json'
```

The script refuses to overwrite an existing destination. It reads a consistent transaction snapshot. Backups include all operational collections and custom definitions, location metadata, the complete audit history, public account names/roles and an `attachmentBlobs` array with base64-encoded local file bytes. The HTTP backup uses the same file-bearing format. Password hashes, session tokens and CSRF secrets are excluded. Event meeting passcodes and saved external URLs remain part of operational backup data. Protect backups as complete copies of the workspace's records and uploaded documents.

Base64 adds roughly one third to file-byte size before JSON metadata is added. A workspace near its 250 MiB file limit can produce a backup larger than 333 MiB. Export and restore currently assemble the backup in memory; allow sufficient process memory, storage space and download time. For large workspaces, prefer the command-line workflow and verify the resulting file. Excel and CSV contain file metadata only and cannot recover uploaded bytes. Remote cloud documents are not copied into any SHUORI backup; maintain their provider-side recovery process.

Schedule this command with the organization's task scheduler or service tooling. Check its exit status, protect and encrypt the destination, retain copies according to policy, and practice restoration. The application itself does not schedule backups or encrypt exports.

For a complete credential-preserving database copy, stop the service cleanly before copying the SQLite database and any remaining companion `-wal` and `-shm` files as a set. Never treat an arbitrary live copy of only the main `.sqlite` file as a verified backup. A database copy contains password hashes and live-session records and needs stronger handling than the operational JSON export.

## Restore into a fresh workspace

The JSON restore tool supports an empty destination of the same operating mode and schema version. It refuses to replace existing operational records. Production recovery should use a new database path and a new bootstrap administrator password:

```powershell
$env:APP_MODE = 'production'
$env:DATABASE_PATH = Join-Path $PWD 'data/production-restored.sqlite'
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Restored workspace administrator password' -AsSecureString)).Password
node scripts/backup.mjs --restore 'backups/production-before-upgrade.json'
```

The restore validates field schemas, custom values, dates, dependencies and references before committing operational records. Historical assignments are preserved without requiring the volunteer's current readiness state, and older records are not rejected solely for a newly required custom field. Installed location definitions are used when restoring; invalid location references are rejected. File restore verifies canonical base64, matching metadata, file signatures, byte counts, SHA-256 hashes, attachment counts and workspace storage limits. Missing, duplicate or orphan blobs are rejected. Records, audit history and validated file bytes are imported atomically; a restoration audit entry is appended and destination sessions are invalidated.

Older schema 1 backups that omit the new collections restore them as empty. A backup that declares a local file must include its bytes; metadata-only file references cannot be restored as working uploads. Restore continues to refuse an occupied destination, including a second check under its write lock. Stop any service process using the destination while restoring.

Sign in with the destination workspace's `admin` account and bootstrap password. Additional accounts must be recreated because credentials are intentionally excluded from JSON backups. Check collection counts, custom fields, a representative event, activity record, schedule and an authenticated attachment download before switching the service's `DATABASE_PATH` to the restored file. Compare a restored file's bytes/hash with the source backup evidence. Keep the previous database until the recovered service has been accepted.

Demo backups are intended as portable evidence and cannot be imported into production. The standard demo initializer creates records immediately, so the empty-workspace restore workflow is intended for production recovery.

## Validation before release

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
```

The build type-checks TypeScript and creates the production assets. The API/domain tests use temporary databases and verify authentication, authorization, CSRF, stale-write protection, audit atomicity, scheduling, dependencies, CSV escaping, readiness changes, custom-field rules, event references, attachment validation, persistence and file-bearing backup restoration. End-to-end tests use installed Google Chrome through Playwright; the README describes the alternative Chromium setup.

The repository also provides a multi-stage `Dockerfile` and `compose.yaml`. Configure `APP_ORIGIN` and the first-start `ADMIN_PASSWORD` in the shell or a private Compose environment file, then run `docker compose up --build -d`. The container uses a non-root account, persists `/app/data` in a named volume, and exposes its service only at host loopback port 3001. The external HTTPS reverse proxy remains the operator's responsibility. Docker was not available in the build environment, so this optional deployment path has not been runtime-validated.

Confirm the deployed `/api/health` endpoint returns the expected mode and version. Test sign-in through the actual HTTPS origin, role restrictions, a sample edit, export, browser refresh and a backup/restore rehearsal. The health endpoint reports process readiness; it is not an ongoing disk-capacity, database-integrity or backup monitor.

## Operational limits

The production database and exports are not encrypted by the application. Use operating-system access controls and approved encrypted storage. No automatic retention, schema migration framework, external identity integration, email notification, field-level redaction or compliance certification is supplied. Audit history grows until the operator manages it through an approved retention process.

Use the system for volunteer coordination and aggregate service reporting. Do not enter patient identifiers, clinical notes, antibody results or vaccination details into general notes. Administrative clearance status is sufficient for the scheduling rule. The spatial model is illustrative and cannot certify real routes, capacities, emergency plans or room availability.

Readiness changes do not erase existing shifts: review flagged assignments after changing training, availability or clearance. The allocator is a suggestion engine; coordinators remain responsible for approving the final roster and confirming departmental requirements. Critical-path durations use calendar days, including weekends and holidays.
