# Floor model provenance and simulation assumptions

Reviewed on 2026-10-08, using official University of Tokyo Hospital pages.

## Full public-guide coverage

The release models all **eight published levels** in the official English guide. Each reference image below was downloaded temporarily and visually inspected; no official map image is redistributed. The English guide may contain older service labels, so current clinical assignments require confirmation with the hospital.

| Level | Official reference | Public-guide service zoning |
| --- | --- | --- |
| B3 | [B3](https://www.h.u-tokyo.ac.jp/english/images/international-patients/floor-guide/b3.gif) | Radiotherapy in Central Clinical Building 2; other footprints unspecified. |
| B1 | [B1](https://www.h.u-tokyo.ac.jp/english/images/international-patients/floor-guide/b1.gif) | Scintigraphy, MRI, nutrition counseling, coffee, convenience store, dining/terrace. |
| 1F | [1F](https://www.h.u-tokyo.ac.jp/english/images/international-patients/floor-guide/f1.gif) | Entrance, information, first visits, billing/prescriptions, orthopaedics, obstetrics/gynecology, X-ray, endoscopy, after-hours reception, admissions. |
| 2F | [2F](https://www.h.u-tokyo.ac.jp/english/images/international-patients/floor-guide/f2.gif) | Internal medicine, pediatrics/pediatric surgery, pain relief, clinical diagnostics, physiological examination and clinical trial clinic. |
| 3F | [3F](https://www.h.u-tokyo.ac.jp/english/images/international-patients/floor-guide/f3.gif) | Surgical specialties, ophthalmology, blood transfusion, delivery/IVF, dialysis/apheresis, Kodama branch school. |
| 4F | [4F](https://www.h.u-tokyo.ac.jp/english/images/international-patients/floor-guide/f4.gif) | Dermatology, urology, neuropsychiatry, oral/maxillofacial surgery and operating center. |
| 6F | [6F](https://www.h.u-tokyo.ac.jp/english/images/international-patients/floor-guide/f6.gif) | Library, preventive medicine, rehabilitation in Clinical 2, and Ward A. |
| 7F | [7F](https://www.h.u-tokyo.ac.jp/english/images/international-patients/floor-guide/f7.gif) | Cardiac rehabilitation in Clinical 2, and Ward A. |

The guide's four-wing relationship is represented: outpatient block to the left, Central Clinical Building 1 in the middle above Clinical Building 2, and the polygonal Ward A footprint to the right. Those are diagram-relative directions, not a surveyed north orientation. Gray/unspecified guide footprints remain unassigned to clinical functions. Original low service volumes on those footprints are illustrations only.

**5F, B2, and other hospital buildings/levels outside this public guide are omitted.** The building view is the public-guide stack, not a complete inventory of the hospital estate. Stack heights are illustrative, including the gaps between published levels.

## Official references

| Reference | Supported facts | How used |
| --- | --- | --- |
| [English floor guide](https://www.h.u-tokyo.ac.jp/english/international-patients/floor-guide/index.html) | Hospital floor guide includes 1F and 6F. | Linked directly from the application; reference for the modeled floors. |
| [Official 1F floor plan, PDF](https://www.h.u-tokyo.ac.jp/patient/shinryoutou/pdf/floor-map_1f.pdf) | Outpatient building, central clinical buildings, main entrance, general information, first-visit registration, outpatient services, and garden/green terrace appear on 1F. | Semantic reference for entrance, reception, outpatient and garden service areas. Relative coordinates in the software are original schematic positions, not extracted survey points. |
| [Official patient library page](https://www.h.u-tokyo.ac.jp/patient/library/) | Nikoniko Bunko+ is in Central Clinical Building 2, 6F. Listed opening hours are Monday, Wednesday, Friday 10:00–14:30; closed Tuesday and Thursday. The page notes volunteer shortages can cause additional closures. | Library floor/building, published hours, and the source link in the floor inspector. Recheck local notices before operational use. |
| [Official 6F floor plan, PDF](https://www.h.u-tokyo.ac.jp/patient/shinryoutou/pdf/floor-map_6f.pdf) | Search-indexed text identifies the library on 6F, Central Clinical Building 2. | Secondary corroboration only: direct retrieval through the research browser failed, so no geometry has been transcribed from this file. |

## Original model

`src/components/hospitalModel.ts` generates original cutaway models with Three.js, rendered and controlled by `src/components/HospitalScene.tsx`. No official floor-plan image, logo, or map artwork is bundled or redistributed. Dimensions are unknown. Walls, desks, shelving, chairs, glazing, trees, lift position, corridors, orientation, and route shapes are illustrative. They must not be used for navigation, evacuation planning, accessible-route certification, or capacity certification.

The scene coordinates are in arbitrary units. There is no meter scale. The north marker is explicitly labeled **concept** because the rendered orientation has not been surveyed. A facility with `source: official` means a facility reference is supported; it does **not** mean its scene coordinates have been verified. The garden service station and volunteer coordination hub are operational concepts, not claims of a staffed official facility at those coordinates.

Each level reproduces the complete broad footprint in the public guide through original geometric approximations, source-referenced service zones and anonymous illustrative subdivisions. This is not a complete architectural floor survey. The 6F model adds original library furniture. Other original furnishings include desks, waiting seats, treatment beds, imaging equipment, rehabilitation rails, plants, stair treads, lift doors and facade windows. Ward A contains anonymous room modules, not claims about actual ward room identities. Labels such as treatment or consultation suites describe concept subdivisions of referenced services.

`modelLocation()` transforms the application's original hypothetical station coordinates into the larger guide composition. The entrance and garden use explicit concept anchors. This transformation does not upgrade the coordinates into surveyed locations. Vertical shafts illustrate possible inter-floor circulation; they are not verified accessible connectors or lift-motion simulations.

The user can inspect an exploded eight-level stack, isolate each level, adjust floor separation, toggle facade/zone labels, and orbit, pan, zoom and reset the model.

## Standalone artifacts and export

- [`artifacts/models/hospital-public-floors.glb`](../artifacts/models/hospital-public-floors.glb): GLB 2.0 containing all eight modeled levels, with source links, floor identities, and schematic disclaimers in glTF extras.
- [`artifacts/previews/hospital-building-render.png`](../artifacts/previews/hospital-building-render.png): standalone model rendering.
- [`artifacts/spatial-validation.json`](../artifacts/spatial-validation.json): model and browser acceptance evidence.

The model toolbar exports its currently visible architecture as GLB, respecting floor selection, separation and facade state. Volunteer identities and shift data are not embedded in the model export. PNG export captures the rendered scene canvas, including enabled zone sprites, but excludes HTML floor/station buttons and the inspector. No official map artwork is included in either export.

## Schedule and animation semantics

- The selected date filters the persisted schedule. Simulation time is shown in Japan Standard Time.
- A shift contributes at `start <= time < end`, excluding draft and cancelled shifts. Historical completed shifts can be rehearsed.
- A station's count is the number of distinct assigned volunteer IDs in its qualifying shifts. Floor totals deduplicate IDs across that floor. Required positions and unfilled positions are summed per shift.
- Each qualifying volunteer/shift assignment produces a token. A volunteer with overlapping assignments would appear in each corresponding shift. Scheduling validation is responsible for rejecting such overlaps; this display does not silently invent a new assignment.
- Animation follows a deterministic, arbitrary corridor walk seeded by volunteer ID and simulation time. One round trip lasts 24 simulation minutes by design; this is not a measured or predicted journey.
- Playback runs at 1, 10 or 30 simulation minutes per real second, never real-time tracking. It stops at 18:00. Scrubbing the range input updates scheduled presence.
- **Assignment density** colors represent scheduled volunteers. They are neither patient occupancy nor a crowd model. Scene positions and density are never transmitted as location observations.
- There are no sensors, individual device locations, patient records, patient trajectories, or live occupancy feeds.
- Volunteer assignments are connected to existing 1F/6F service stations; additional levels do not receive fabricated schedules.

## Rendering and accessibility

The model uses an orthographic camera, OrbitControls, bounded zoom, and dedicated reset/zoom controls. Service station and floor buttons are keyboard accessible; the parallel inspector provides details without requiring spatial interaction. The 2D plan is always available via a view toggle and becomes the automatic fallback when WebGL cannot initialize or its context is lost. The building fallback lists all eight floors as accessible buttons leading to their individual 2D plans. The inspector and schedule continue to work without WebGL.

Three.js geometries, materials, renderers, observers, event listeners and animation frames are disposed when views unmount. Playback begins paused and requires explicit activation; users who prefer reduced motion are not forced into animation.

Browser acceptance exercises all eight floor selectors, floor separation, facade/density toggles, playback/reset, end-of-day zero staffing, 2D/3D switching, forced WebGL failure, mobile overflow, GLB download and PNG download. The GLB is checked for magic/version/length, scene JSON, all eight floor nodes, and embedded provenance. Previews and the machine-readable report are stored under `artifacts/`.

## Operational calibration before any real routing use

An authorized facilities representative would need to provide a measured plan, confirm reproduction rights, map verified accessible corridor and lift connections, approve service-station positions, and validate movement assumptions. Replace the original conceptual coordinate graph with that verified dataset before describing the feature as a digital twin or real route planner. The present release consistently describes it as a planning simulation.
