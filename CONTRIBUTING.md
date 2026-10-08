# Contributing to SHUORI

Contributions should improve the volunteer coordination workflows and preserve the documented data and spatial assumptions. Original software contributions use **[AGPL-3.0-only](LICENSE)**; designated original model data, artwork and documentation use **[CC BY-NC-SA 4.0](LICENSES/CC-BY-NC-SA-4.0.txt)**. Read the [path map](LICENSES/README.md), [licensing guide](docs/LICENSING.md) and [third-party notices](docs/THIRD-PARTY-NOTICES.md) before submitting work.

## Set up a development workspace

Use Node.js 22.13 or newer; the release was verified with Node.js 22.17.0. Clone your fork or the project repository, then run these commands from its root:

```sh
npm ci
npm run dev
```

On Windows PowerShell, use `npm.cmd` in place of `npm` if the execution policy blocks `npm.ps1`. The development interface is at `http://127.0.0.1:5173`; the API uses port 3001. Stop another API instance before starting development. The application reads environment variables from the process; it does not load `.env` automatically.

The demo uses fictional data and persists edits in `data/demo.sqlite`. Use a separate disposable database for investigation or seed changes. Never commit databases, backups, credentials, real volunteer details or confidential hospital information. See [deployment and operations](docs/DEPLOYMENT.md) for configuration.

## Make a focused change

Discuss major workflow, storage or model changes in a repository issue before investing in a large implementation. A useful issue describes the task, the observed behavior, the expected result and reproducible steps using fictional records.

- Keep interface text and technical documentation in English; preserve the **守織 SHUORI** identity.
- Maintain the distinction between demo and production state, role permissions, CSRF checks, record-version checks and atomic operations.
- Keep scheduling and critical-path rules in the shared domain modules so the API, interface and exports agree.
- Preserve stable identifiers and compatibility with existing backups and scene files. Document a migration when a change requires one.
- Record the source and uncertainty of new floor information. Label invented dimensions and furnishings as illustrative.
- Keep model descriptions and artwork separate from executable rendering code. Put spatial asset data in `content/spatial/` and preserve its notices; do not move noncommercial asset definitions into AGPL source files.
- Provide equivalent accessible controls for visual interactions where practical. Review keyboard focus, readable contrast and narrow-screen layouts.
- Update the relevant guide when behavior, limits, setup or export contents change.

Use original work or material you have permission to contribute under the applicable project terms. Identify third-party code or assets, retain their notices and document their licenses. Do not imply that hospital names, marks or source diagrams are owned by this project.

## Verify the behavior

Run the required build and API/domain checks:

```sh
npm run build
npm test
```

The Node tests create disposable databases. They cover actual API behavior, authorization, validation, scheduling, critical-path calculations, saved scenes and Excel files. The CI workflow runs these commands on Ubuntu with Node.js 22.17.0 after `npm ci`.

For changes to interactive workflows, run the relevant browser acceptance tests after the build:

```sh
npm run test:e2e
```

The browser suite requires installed Google Chrome, starts an isolated API server on port 3010 and does not use the normal demo database. The [verification guide](docs/VERIFICATION.md) describes browser configuration, spatial validators and additional accessibility checks. For procedural geometry changes, also run:

```sh
node scripts/validate-spatial-assets.mjs
```

Use focused regression coverage for changes that affect behavior. For visual changes, inspect the affected desktop and mobile views and include current screenshots. Do not claim a check passed unless you ran it; describe any environment limitation.

When refreshing README screenshots, capture them from a fictional demo workspace and visually check the images for the independent SHUORI identity. Then run `node scripts/publish-readme-previews.mjs` to publish byte-identical copies with content-specific filenames and update the README links. This gives changed images new URLs so README image caches cannot retain an older branded screenshot. Run `node scripts/publish-readme-previews.mjs --check` to verify the links, image bytes and SHA-256 manifest before committing. The existing capture scripts continue to use their stable output filenames.

## Submit a pull request

Describe the concrete problem, resulting behavior, validation performed and any migration or compatibility impact. Link the relevant issue when one exists. Keep unrelated cleanup separate so reviewers can understand the effect of the change.

Submit only material you are entitled to share under the license applicable to its component. A software contribution is offered under AGPL-3.0-only; a contribution to designated creative assets or prose is offered under CC BY-NC-SA 4.0. Preserve attribution and disclose the origin and license of incorporated third-party work. Submitting a contribution does not transfer ownership of your work or grant permission to relicense other contributors' material.
