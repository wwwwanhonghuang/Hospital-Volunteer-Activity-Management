// SPDX-License-Identifier: AGPL-3.0-only
import { createApp } from './app.mjs';
const port=Number(process.env.PORT||3001),host=process.env.HOST||'127.0.0.1';
const app=createApp();
const server=app.listen(port,host,()=>console.log(`守織 SHUORI volunteer operations (${app.locals.mode}) is listening on http://${host}:${port}`));
let closing=false;
function shutdown(){if(closing)return;closing=true;server.close(()=>{app.locals.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
