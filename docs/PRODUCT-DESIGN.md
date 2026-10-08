# Product design and operational fit

## Purpose

守織 SHUORI supports the coordinator's daily questions: Who is ready to help? Where are people needed? Which preparation tasks determine an event's completion? What happened during service? Which follow-ups are still open?

The job brief defines six responsibility groups. The application translates them into persistent workflows rather than unrelated demonstration widgets.

| Responsibility in the supplied brief | Workspace treatment |
| --- | --- |
| Recruitment, selection, training, publicity and implementation | Volunteer lifecycle and eligibility; recruitment/training project briefs; dependent preparation tasks; responsibilities and dates |
| Activity monitoring, consultation and department coordination | Daily/weekly schedule, coverage, individual history, support requests and assigned department follow-up |
| Records, reports and recognition | Validated actual-hours records, monthly reports, participation summaries and recognition candidates; recognition projects |
| Health-related administrative support | Clearance state and review date, follow-up visibility and assignment gates; coordination requests for arranging appointments |
| Activity environment | Station inventory, inspection dates, maintenance, service-improvement requests and editable 3D layout scenarios |
| Visitor reception, wayfinding and wheelchair support | Skill requirements, staffing gaps, assigned service locations, recorded interactions and schedule rehearsal |
| Niko Niko Bunko Plus support | A sourced sixth-floor library station, library skills, library projects and service records |
| Hospital events and service improvement | Goals, budget/spend, risk notes, ownership, dependency network, what-if durations and task board |
| General operational administration | Named roles, version conflicts, audit records, CSV exports, backups and recovery instructions |

Recruitment messages, clinical health results and official incident reports remain in their appropriate institutional channels. The software records coordination work; it does not send unsolicited email or attempt to deliver healthcare.

## Main journeys

### From applicant to a first service shift

1. Create the volunteer as an applicant, with contact information and relevant skills.
2. Move to onboarding; record training and the administrative clearance state.
3. Set declared weekdays, available hours and the maximum weekly commitment.
4. Activate the profile once the coordinator has confirmed readiness.
5. Create a service shift and inspect eligible candidates, or generate a proposal.
6. Review the assignment. On saving, the server checks the current roster and record version.
7. After service, record actual participation and aggregate interactions. Reports and the profile history update from the saved record.

Readiness changes do not erase existing assignments. Coordinators can inspect reasons and reassign affected shifts while continuing unrelated operational work.

### From an idea to an event

1. Record a project purpose, outcomes, owner, partner department, target dates and resources.
2. Add tasks with durations and explicit predecessors.
3. Inspect the dependency timeline, float and critical tasks.
4. Preview the effect of a duration change in the what-if tool.
5. Advance tasks, update actual spending and create linked service shifts.
6. Rehearse space and staffing, record service, and review outcomes against the brief.

The model deliberately separates task duration analysis from person-level scheduling. A critical path alone does not prove that enough eligible people are available.

### From a concern to a resolved improvement

1. Create a consultation, improvement, incident follow-up or coordination request.
2. Name its owner, department, priority and next review date.
3. Move it into progress and document the action.
4. A resolution is mandatory before closure. The audit trail retains the change.

### From a spatial idea to a service rehearsal

1. Isolate a public-guide floor and inspect its furnishings, equipment and reference zones.
2. Create a named scenario for the proposed arrangement, such as a welcome-counter layout or a library activity setup.
3. Add individual assets, adjust their position and rotation, and compare arrangements using undo, redo or saved copies.
4. Choose a scheduled volunteer and shift on that floor and draw a proposed sequence of route points.
5. Rehearse the selected date and time, inspect staffing, and export the study for a coordinator's review.
6. Keep the accepted scene as a planning reference. Changes to actual assignments continue through the schedule workflow.

The scene models a proposal's objects and movement, while the operational record defines who is assigned. A rendered route is not evidence of measured travel time, navigability or safe clearance.

## Spatial design

The public guide provides horizontal building relationships and named service zones. It is translated into an original procedural scene across its eight published levels. Floor plates, partitions, doors, windows, lifts, stairs and optional facades provide a fixed architectural reference. Detailed chairs, desks, shelves, wheelchairs, beds, trolleys, signs and other assets form independently selectable objects. Their meshes model visible components such as books, wheels, leaves and rails. A building overview supports orientation; isolated floors support inspection and editing.

Station counts derive from the currently selected date and rehearsal time. Articulated figures remain associated with actual assigned volunteers. A saved scenario may provide a drawn route for a specific person and shift; otherwise figures follow illustrative station paths. Routes stay within one floor and use an arbitrary 24 simulation-minute round trip. Density is assigned volunteers relative to a concept station capacity. No collision detection, automatic pathfinding, crowd simulation or emergency-route validation is performed.

The object browser provides name/zone search, category filters, visible selection and a focus action. An anchored viewport card and a detailed inspector connect geometry with its meaning. Move and rotate controls snap pointer edits to 0.25 scene units and 15 degrees, with numeric position and rotation fields available. Forty prior changes and redo support exploration. Hidden objects remain discoverable in the list. Coordinators can add, hide, reset and save furnishings; structural geometry remains fixed.

The 2D alternative is available explicitly and automatically when WebGL cannot initialise. It provides orientation and staffing information; detailed 3D manipulation requires WebGL. Viewers can explore and export saved scenes. Coordinators and administrators can save scenarios through the same versioned, audited API as other operational records. Scenario JSON supports portable studies; imported routes require matching operational records. Full backups preserve both scenarios and their references. See [Spatial Studio](SPATIAL-STUDIO.md) for the complete workflow.

## Interaction and information design

- The overview answers immediate staffing questions before presenting secondary reporting.
- A persistent workspace date drives the overview and initial schedule/simulation views; local controls allow rehearsal of other dates.
- Mutations save through the API, refresh the shared state and provide clear confirmation or an actionable validation error.
- Modal forms have associated labels, focus containment, Escape-to-close, and focus return.
- Read-only accounts see readable detail views without editing controls. The server also enforces these permissions.
- Explicit empty states support a clean production database.
- Export actions identify their scope: complete collection, filtered activity list, selected reporting month or visible calendar period.
- Mobile navigation collapses into a drawer. Large timelines and data tables scroll inside their own containers.

## Practical release scope

This release is a self-hosted, single-server coordination application. SQLite provides transactional persistence and restart continuity. It includes deployable server code, not just a presentation mock-up.

This release does not implement hospital SSO, multi-site tenancy, per-field health permissions, email/SMS delivery, leave-approval chains, vaccination-result handling, formal clinical incident reporting, payroll, accounting reconciliation, legal retention automation or a measured BIM asset pipeline. Spatial modeling is limited to whole-asset transforms and floor-local rehearsal routes; it does not provide mesh editing or measured circulation analysis. These extensions would require concrete institutional requirements and integration access.

No claim of hospital endorsement, legal compliance certification or measured spatial accuracy is made. Demonstration data is fictional; production starts empty. Operational acceptance should establish the actual station definitions, hours, training rules, transfer allowances, privacy access and backup procedures.
