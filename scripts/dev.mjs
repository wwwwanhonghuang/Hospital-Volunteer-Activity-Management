// SPDX-License-Identifier: AGPL-3.0-only
import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['--watch', 'server/index.mjs'], {stdio: 'inherit'}), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {stdio: 'inherit'})];
let stopping = false;
function stop(code = 0) {if (stopping) return; stopping = true; for (const child of children) child.kill(); setTimeout(() => process.exit(code), 100);}
for (const child of children) child.on('exit', code => stop(code || 0));
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
