# Spatial Studio · 守織 SHUORI 1.2

Spatial Studio lets coordinators arrange a detailed hospital planning scene, inspect its objects and rehearse the movement of scheduled volunteers. Layouts and routes can be saved as named scenarios, compared, exported and reopened. A scenario is a spatial study: saving it does not change the operational roster, inventory quantities or service records.

## Explore the building

Open the spatial workspace and select **Building** to see the exploded stack. The model includes the eight levels published in the source guide: **B3, B1, 1F, 2F, 3F, 4F, 6F and 7F**. Select a floor to work with its interior. Floor separation changes the presentation of the stack; it does not modify the underlying layout.

Drag to orbit and scroll to zoom. Click an object to select it; double-click it to focus the camera. The **Scene objects** list offers the same selection through searchable, keyboard-accessible buttons. Search by name, kind, floor or reference zone, and filter by furniture, equipment, signage, plants, people or structure. Hidden objects remain available in this list.

A selected item has an outline, a screen information card anchored to its position, and an **Object inspector** with its floor, zone, description, dimensions and transform. **Focus** brings the camera to that object. Facade, labels, station information, people and route layers can be adjusted to reduce clutter. A top view helps with layout and route editing.

The 2D view remains available as an orientation and staffing fallback when WebGL is unavailable. The 3D manipulation handles and object detail rendering require WebGL.

## Detailed objects and people

The asset library contains 15 original procedural models. Each asset is independently selectable. Its detailed component geometry is batched by surface finish for efficient rendering, while component names remain in the model metadata. Moving an asset moves its components together.

| Asset | Modeled details |
| --- | --- |
| Visitor chair | Seat, back, armrests and legs |
| Workstation | Desktop, monitor, keyboard, document tray and pedestal |
| Dining table | Tabletop and supporting base |
| Welcome counter | Counter sections, lowered section, display and leaflets |
| Book collection | Shelves and individual book spines |
| Wheelchair | Spoked wheels, rims, casters, footplates and handles |
| Care bed | Frame, mattress, pillow, blanket, rails and wheels |
| Volunteer trolley | Shelves, supplies, books, handle and wheels |
| Information kiosk | Display, diagram, marker, support and base |
| Wayfinding sign | Signboard, illustrative graphics and supports |
| Indoor planter | Pot, stems and separate leaves |
| Imaging model | Generic imaging equipment geometry and table |
| Rehabilitation bars | Rails, supporting posts and exercise platform |
| Waiting bench | Separate seat cushions, armrests and supports |
| Privacy screen | Three panels, frame and rolling feet |

Volunteer figures have independently modeled body parts and animated arm and leg movement. Each figure represents a volunteer assigned to an active shift at the selected rehearsal time. Selecting a figure shows its operational association; it is not a freely placeable patient or staff record. Draft and cancelled shifts do not animate. Figures disappear when their shift is outside the selected time.

## Arrange a floor

1. Sign in as a coordinator or administrator and choose a single floor.
2. Select a furnishing in the model or object list, or add an item from **Asset library**.
3. Choose **Move** and drag a colored handle, or choose **Rotate** and drag the rotation ring. Pointer movement snaps to **0.25 scene units**; rotation snaps to **15 degrees**.
4. Use the inspector fields for an exact X, height, Z or rotation value. Press Enter or leave the field to apply it. The 90-degree rotation buttons support quick placement.
5. Use **Hide** to remove an item from the view while retaining it in the scenario. **Show** restores it. **Reset** removes that object's override and restores its initial transform; an added object's initial transform is its placement at creation.
6. Use **Undo** or **Redo** to navigate the current editing history. Up to **40 prior changes** are retained. Saving or loading a scenario starts a new history.
7. Give the study a name and save it. Reopen it from the saved scenario list, or save a copy to compare another arrangement.

Structural geometry is a fixed reference. Walls, slabs, doors and other architectural objects can be inspected but are not remodeled with these controls. Furnishings and equipment are editable as whole assets; the studio does not provide mesh, material or component-level CAD editing. Added assets can be removed completely; existing model assets can be hidden or reset.

Coordinates are local to the selected floor. Exploding the building adds only a display offset. X is limited to −45 through 45, Z to −22 through 22, and height to 0 through 6; stored rotation is within ±2π radians. These are arbitrary scene units, not surveyed metres. The editor does not detect object overlap, wall intersections, insufficient clearance or blocked doors.

## Rehearse volunteer routes

Choose a date and single floor, then choose a volunteer and their assigned shift in the people/route controls. Start drawing and click the floor to place waypoints. Use at least two different points and no more than 50. Finish the route to add it to the scenario, then use the time slider or playback controls to inspect the rehearsal.

Each route belongs to one volunteer and one real shift. Its floor must match that shift's service location. A scenario allows one route for a given volunteer/shift pair. Routes remain on one floor; selecting a different floor does not create a lift or stair journey. Existing historical assignments may be rehearsed, including completed shifts and volunteers who are now archived.

Movement is interpolated along the drawn segments in proportion to their length, with an arbitrary **24 simulation-minute round trip** and an offset per volunteer. The figure follows the route while its shift is active, then disappears outside that shift. Without a custom route it follows the built-in illustrative station route. Playback speed controls simulation minutes per real second; it is not a walking-speed estimate.

The engine provides no collision avoidance, obstacle routing, shortest-path calculation, transfer optimization or crowd simulation. Route lines can intersect furnishings or walls. Review every proposed route against the actual space before treating it as an operational proposal.

A saved route retains its shift and volunteer references. Before removing that assignment, moving its shift to another floor, or deleting the linked shift or volunteer, update or remove the route in every referencing scenario. The server refuses changes that would leave an inconsistent scenario and names the affected study. This rule also applies to batch schedule changes, which either succeed together or remain unchanged.

## Save, transfer and export

| Action | Result |
| --- | --- |
| Save scenario | Persists the study in SQLite, with a version and audit entry |
| Save a copy | Creates a separate scenario with its own identifier |
| Scenario JSON export | Downloads layout overrides, additions, routes, name and description |
| Scenario JSON import | Opens a validated study as an unsaved copy; save to persist it |
| Download 3D model | Exports the visible structural model and scenario furnishings as GLB |
| Image export | Captures the rendered viewport as PNG |
| Collection CSV | Exports scenario records; nested geometry is represented as JSON cells |
| Administrator backup | Includes scenarios, operational records and audit history in the full workspace backup |

Scenario JSON uses `{ "format": "shuori-scene", "version": 1, "scenario": { ... } }`. Legacy `komorebi-scene` files remain readable. It is distinct from an administrator workspace backup. Imported routes must refer to volunteers and shifts already present in the destination workspace; importing a scene does not create those records. Scene files contain names and record references, so share them with appropriate recipients.

GLB is a static geometry export. It does not include the operational database, editable scenario history, browser information panels or volunteer route animation. Keep the scenario JSON for further editing and the workspace backup for recovery of operational data.

Unsaved drafts are retained in the current browser tab's session storage under the signed-in account. Closing or reloading the tab with pending changes triggers the browser's unsaved-work warning. This temporary draft is not a server backup and does not transfer to another browser. The saved scenario is the persistent record.

Concurrent scenario edits use the same optimistic version checks as other records. If another coordinator saves first, refresh and load their current record before retrying, or save the local arrangement as a new copy. Viewers can inspect and export; server writes require a coordinator or administrator and a valid session security token.

## Storage and compatibility

The `scenarios` collection uses the existing entity table and generic API:

- `POST /api/scenarios` creates a scenario.
- `PUT /api/scenarios/:id` requires its current version.
- `DELETE /api/scenarios/:id` requires its current version.
- `GET /api/state` includes saved scenarios.
- `GET /api/export/scenarios.csv` exports the collection.

The shared validator in `shared/spatial-scenario.mjs` checks geometry, supported asset kinds and floors, unique identifiers, route assignment references and capacity limits. A scenario can contain at most **2,000 overrides, 300 additions and 100 routes**. Names are limited to 160 characters and descriptions to 4,000. Invalid numbers and reserved prototype keys are rejected. API JSON requests are limited to 1 MiB; the scene file importer limits files to 1,000,000 bytes.

Existing databases require no table migration. An absent scenario collection reads as an empty list. The workspace backup format remains schema version 1; restoring an older version 1 backup without scenarios supplies an empty list. Restore validates all scenario references before inserting operational records and retains the destination administrator credentials.

## Source and model boundaries

The bundled example retains an original reconstruction of an external source hospital's public floor guide, with provenance in [Floor sources](FLOOR-SOURCES.md). It is an illustrative demo, not an official model or evidence of affiliation. Added detail does not create new evidence about the source hospital's actual furniture, equipment, room dimensions, accessibility, circulation or inventory. The published guide omits B2 and 5F; the application continues to omit them. It does not reconstruct unpublished wards or the whole campus. A deploying organization must provide and validate its own operational locations.

See [Floor sources](FLOOR-SOURCES.md) for source provenance and [Architecture](ARCHITECTURE.md) for the data and authorization model. The release's executed checks and remaining validation limits are recorded separately in [Verification](VERIFICATION.md).
