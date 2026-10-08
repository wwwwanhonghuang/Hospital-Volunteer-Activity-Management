# Events, volunteer profiles and flexible records

SHUORI 1.3 connects a volunteer's profile, scheduled events, activity history, follow-up notes and supporting files. Each item has a stable ID, version and creation/update timestamps. The same event can coordinate a meeting, a preparation checklist, participant attendance, linked shifts and a report folder.

## Choose the right record

| Record | Use it for | What it contributes |
| --- | --- | --- |
| Volunteer profile | Contacts, emergency contact, programme status, skills, languages, availability, tags and custom attributes | Current coordination information and administrative readiness |
| Activity record | Completed service by a volunteer on an assigned shift, optionally connected to an event | Recorded hours and aggregate service interactions in monthly reports |
| Journal entry | Orientation notes, a conversation summary, a meeting follow-up or a milestone | Dated history with a category, open/complete status, optional follow-up date and optional event link |
| Scheduled event | A meeting, training session, briefing, activity, recognition occasion or a custom event type | A start/end time, owner, venue, participants, preparation and related operational records |
| Attachment | A report, agenda, image, worksheet or existing cloud document | A local authenticated download or an external HTTPS link on its parent record |

Journal entries belong to a volunteer; they may also belong to an event. For a general event report, upload a report file or add a cloud document link directly to the event. Attendance and journal entries do not create service hours. Enter actual service in activity records so report totals remain explicit and auditable.

## Extend the profile without changing code

Volunteer profiles include preferred contact method, address, emergency contact name/relationship/phone and flexible tags alongside the existing training, availability and programme information. Custom fields can be defined separately for **volunteers**, **events**, **activity records** and **journal entries**.

Each field has a label, display order, active state and optional required flag. Available types are short text, long text, number, date, a choice from defined options, and Boolean. Number and Boolean values keep their types throughout editing, storage and Excel exports. A required Boolean can be either `true` or `false`; it does not force consent or agreement.

For example, add a volunteer field called “Preferred programme” with a list of programme options, an event field called “Expected participants” as a number, and a journal field called “Follow-up method” as a choice. The same definition appears consistently on records in its selected scope. Field labels must be unique within that scope.

Archive a field when it is no longer used. Its existing values and export labels remain available. Once a field has saved values, its type or scope cannot be changed; create a replacement field if the meaning changes. A select option cannot be removed while records still use it. Adding a required field does not invent values for older records: complete that field when those records are next edited.

## Build an event from modules

An event has a title, type, description, lifecycle status, owner, venue details and start/end dates and times in **Asia/Tokyo**. Events may span several dates. The end must follow the start. Event types are editable classifications with a color and default modules; examples include planning meetings, training and programme activities. Archived types remain on existing events.

| Capability | Saved information | Behavior |
| --- | --- | --- |
| Meeting | Provider, HTTPS join URL, meeting ID, passcode and agenda | Open the saved meeting address on Zoom, Google Meet, Teams or another platform |
| Checklist | Item title, owner, due date and complete flag | Track preparation and follow-up inside the event |
| Attendance | Selected volunteer and invited/confirmed/attended/absent state, plus notes | Preserve recorded attendance independently from staffing assignments |
| Files and links | Uploaded documents or external HTTPS links | Available on every event without enabling a special module |
| Operational links | Project, volunteers, shifts and resources | Connect preparation, staffing and materials to the same event |
| Custom fields | Typed values from event field definitions | Adapt the event record to the programme's reporting needs |

An event participant must be added to the volunteer list before receiving an attendance entry. Event links reference existing records. Linking a resource records the intended resource; it does not reserve inventory quantities. Linking a shift does not change its assigned volunteers or create a new shift. The shift scheduler continues to validate availability, readiness, required skills, workload and conflicting assignments. Event forms and overview panels show advisory participant overlaps across multi-day events and service shifts; explicitly linked shifts are treated as the same work. These warnings do not reserve volunteer availability or alter automatic shift allocation.

For an orientation session, choose a training type, set its venue and time, add the participating volunteers, enable attendance and a preparation checklist, then attach the handout. For an online planning meeting, enable the meeting module, paste the join URL and agenda, link the project, and add a report or minutes document after the meeting. Meeting hosting remains on the chosen platform. Zoom documents its meeting-link and meeting-ID joining workflows in [Joining a Zoom meeting](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060732).

SHUORI stores an existing meeting address; it does not create meetings through provider APIs, issue calendar invitations, retrieve recordings or synchronize provider attendance. A saved passcode is operational event data visible to the workspace's readers. It is deliberately excluded from Excel exports, as are meeting URL query strings and fragments.

## Keep reports with their event

Files and external links can be attached to events, volunteer profiles, shifts, activity records and journal entries. The attachment list shows its name, description, uploader, upload time and storage kind. Local files also record byte count, content type and SHA-256 checksum. Downloading requires a signed-in SHUORI account. Files are returned as downloads rather than rendered as active page content.

The current local provider stores file bytes with the SQLite workspace. Supported extensions are PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV, TXT, PNG, JPG/JPEG and WebP. A file must be non-empty and no larger than **10 MiB**; the workspace permits **250 MiB** of file bytes and **200 attachments per parent record**. Extension and basic file-signature validation reject mismatches; this is not an antivirus scanner. Filenames cannot contain paths or control characters. Actual storage limits and usage are available from `/api/storage`.

For shared documents already held in Google Drive or another approved service, add an **external link**. SHUORI accepts a complete HTTPS address without embedded username/password credentials. It stores the title, description and address; it does not fetch or duplicate the remote document. External links consume an attachment slot but no local file bytes.

Google Drive's own sharing settings determine who can open, comment on or edit a linked document. A SHUORI account does not grant Drive access. Share the document with the intended people in Drive and copy its link into the event. Google describes these roles and sharing controls in [Share files from Google Drive](https://support.google.com/drive/answer/2494822).

This release supports **local authenticated uploads plus cloud document links**. It does not include Google OAuth, Google Cloud Storage buckets, automatic Drive folders, background synchronization or cloud permission management. Changing to direct cloud storage would require a chosen provider, operator credentials and a defined retention/access policy. No cloud account is connected merely by saving a URL.

## Permissions and change history

| Action | Viewer | Coordinator | Administrator |
| --- | --- | --- | --- |
| Read profiles, events, records and file metadata | Yes | Yes | Yes |
| Download local files and export Excel | Yes | Yes | Yes |
| Create/edit operational records and custom definitions | No | Yes | Yes |
| Upload files, add links and remove attachments | No | Yes | Yes |
| Manage accounts and export recovery backups | No | No | Yes |

Permissions apply to the whole workspace. Event membership and module selection do not create private per-event access rules. A viewer may read all workspace records, including volunteer contact data and event meeting information. An external provider applies its own permissions after a person follows a cloud or meeting link.

Record writes and attachment changes require an authenticated write role and CSRF token, and are recorded in the audit history. Version checks stop a stale edit or removal from silently overwriting another person's work. Referenced records cannot be deleted while doing so would leave operational links or attachment references dangling; remove or reassign the relevant links first. Archiving profiles, event types or custom fields preserves their history where that lifecycle is supported.

## Export and recover

Use event Excel exports for attendance, checklist, relationship rows, linked activity records, journal entries and file references. Volunteer exports include the enriched profile and that volunteer's linked history. Both include a custom-field dictionary with stable IDs, labels, types and archived definitions. Filtered exports keep the exact selected scope; an empty selection creates header-only sheets. See [Excel exports](EXCEL-EXPORTS.md) for the complete worksheet map and limits.

Excel is a review snapshot: file references are metadata, and edited workbooks are not an import format. Administrator JSON backups include operational data, audit history and base64-encoded local file bytes. Restore validates metadata, byte counts, hashes and file types, then restores data and blobs together into an empty workspace. User credentials are not imported. Old backups without the new collections remain supported. External cloud documents are never included in a backup; only their saved links are retained. Keep provider-side recovery procedures for those documents.

For deployment, account setup and backup commands, see [Deployment](DEPLOYMENT.md).
