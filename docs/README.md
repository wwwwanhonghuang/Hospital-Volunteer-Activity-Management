# SHUORI documentation

Start with the [project overview and quick start](../README.md). This directory explains how to operate, extend and evaluate **守織 SHUORI**, an independent hospital volunteer coordination application.

## Find the right guide

| I want to… | Read |
| --- | --- |
| Run the demo, configure a deployment, manage accounts or restore a backup | [Deployment and operations](DEPLOYMENT.md) |
| Understand general hospital volunteer coordination workflows | [Product design](PRODUCT-DESIGN.md) |
| Inspect, edit or export the 3D environment and rehearse routes | [Spatial Studio](SPATIAL-STUDIO.md) |
| Configure volunteer records, run events and meetings, attach reports or connect shared folders | [Events and flexible records](EVENTS-AND-RECORDS.md) |
| Export lists, project plans, monthly reports or the complete workspace to Excel | [Excel exports](EXCEL-EXPORTS.md) |
| Understand the API, persistence, access control and scheduling calculations | [Architecture](ARCHITECTURE.md) |
| Review the floor-guide references and distinguish sourced facts from illustrative geometry | [Floor sources and model assumptions](FLOOR-SOURCES.md) |
| Reuse the application identity consistently | [Brand and SHUORI palette](BRAND.md) |
| Review completed tests, reproduce checks and understand validation limits | [Release verification](VERIFICATION.md) |
| Understand AGPL software, noncommercial creative assets, attribution and source access | [Licensing guide](LICENSING.md) and [component path map](../LICENSES/README.md) |
| Review dependency and third-party asset rights | [Third-party notices](THIRD-PARTY-NOTICES.md) |
| Propose or contribute a change | [Contributing](../CONTRIBUTING.md) |

## Working examples

The repository includes [application screenshots](../artifacts/previews/), [standalone GLB models](../artifacts/models/) and five [Excel workbooks containing fictional data](../artifacts/exports/). The [verification record](VERIFICATION.md) links to the underlying test and inspection evidence.

The demo is editable and persists to its own local SQLite database. Production uses a separate database and requires administrator setup. Excel workbooks are reporting snapshots; use the documented backup and restore procedure for recovery.

## Operating boundaries

The bundled demo floor model reconstructs eight levels from an external hospital's public floor guide. Its dimensions, furnishings and movement paths are illustrative. It is not an official facility model, a surveyed building model or an emergency navigation system. Read the prominent [project notice](../README.md) and [source register](FLOOR-SOURCES.md) before interpreting a spatial study.

This general-purpose application is developed independently as a personal project. It has no affiliation with any particular hospital, university or organization, and no institutional commissioning, endorsement or deployment approval is implied. The [deployment guide](DEPLOYMENT.md) and [verification record](VERIFICATION.md) describe the controls that exist and the reviews that remain specific to each deployment, including accessibility acceptance.
