// SPDX-License-Identifier: AGPL-3.0-only
// Disposable, deterministic showcase. Never opens a saved workspace database.
import { createApp } from '../server/app.mjs';
const app = createApp({ mode: 'demo', dbPath: ':memory:', demoDate: '2026-10-08', demoLoginLimit: 100 });
const server = app.listen(3020, '127.0.0.1', () => console.log('SHUORI showcase: http://127.0.0.1:3020 (fictional, in-memory data)'));
function close() { server.close(() => { app.locals.close(); process.exit(0); }); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
