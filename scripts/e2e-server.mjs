// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
const root = mkdtempSync(join(tmpdir(), 'komorebi-e2e-'));
const app = createApp({mode:'demo',dbPath:join(root,'e2e.sqlite')});
const server = app.listen(3010,'127.0.0.1',()=>console.log('Isolated browser test workspace: http://127.0.0.1:3010'));
function close(){server.close(()=>{app.locals.close();rmSync(root,{recursive:true,force:true});process.exit(0);});}
process.on('SIGINT',close);process.on('SIGTERM',close);
