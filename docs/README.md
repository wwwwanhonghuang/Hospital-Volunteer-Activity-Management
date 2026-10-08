# SHUORI documentation

Start with the [project overview and quick start](../README.md). This directory explains how to operate, extend and evaluate **守織 SHUORI**, an independent hospital volunteer coordination application.

## Find the right guide

| I want to… | Read |
| --- | --- |
| Run the demo, configure a deployment, manage accounts or restore a backup | [Deployment and operations](DEPLOYMENT.md) |
| Understand the workflows and the original job brief | [Product design](PRODUCT-DESIGN.md) and [job background](../meta/JOB-BACKGROUND.md) |
| Inspect, edit or export the 3D environment and rehearse routes | [Spatial Studio](SPATIAL-STUDIO.md) |
| Export lists, project plans, monthly reports or the complete workspace to Excel | [Excel exports](EXCEL-EXPORTS.md) |
| Understand the API, persistence, access control and scheduling calculations | [Architecture](ARCHITECTURE.md) |
| Review the floor-guide references and distinguish sourced facts from illustrative geometry | [Floor sources and model assumptions](FLOOR-SOURCES.md) |
| Reuse the application identity consistently | [Brand and color reference](BRAND.md) |
| Review completed tests, reproduce checks and understand validation limits | [Release verification](VERIFICATION.md) |
| Understand AGPL software, noncommercial creative assets, attribution and source access | [Licensing guide](LICENSING.md) and [component path map](../LICENSES/README.md) |
| Review dependency and third-party asset rights | [Third-party notices](THIRD-PARTY-NOTICES.md) |
| Propose or contribute a change | [Contributing](../CONTRIBUTING.md) |

## Working examples

The repository includes [application screenshots](../artifacts/previews/), [standalone GLB models](../artifacts/models/) and four [Excel workbooks containing fictional data](../artifacts/exports/). The [verification record](VERIFICATION.md) links to the underlying test and inspection evidence.

The demo is editable and persists to its own local SQLite database. Production uses a separate database and requires administrator setup. Excel workbooks are reporting snapshots; use the documented backup and restore procedure for recovery.

## Operating boundaries

The floor model covers the eight levels published in the referenced public guide. Its dimensions, furnishings and movement paths are illustrative. It is not a surveyed building model or an emergency navigation system. Read the [source register](FLOOR-SOURCES.md) before interpreting a spatial study.

This repository is an independent implementation of the supplied job brief. It does not establish hospital endorsement, institutional deployment approval or formal accessibility conformance. The [deployment guide](DEPLOYMENT.md) and [verification record](VERIFICATION.md) describe the controls that exist and the reviews that remain specific to each deployment.
