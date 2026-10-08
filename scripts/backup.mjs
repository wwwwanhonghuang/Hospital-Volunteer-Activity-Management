// SPDX-License-Identifier: AGPL-3.0-only
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from '../server/app.mjs';
import { exportBackup, restoreBackup } from '../server/backup.mjs';
import { tokyoDate } from '../server/seed.mjs';

const restore=process.argv[2]==='--restore';
const mode=process.env.APP_MODE||'demo';
const dbPath=process.env.DATABASE_PATH||resolve('data',`${mode}.sqlite`);
if(!restore&&!existsSync(dbPath))throw new Error(`Database does not exist: ${dbPath}. Start the application first.`);
if(restore&&!process.argv[3])throw new Error('Usage: node scripts/backup.mjs --restore path/to/backup.json');
const destination=resolve(restore?process.argv[3]:process.argv[2]||`backups/shuori-${mode}-${tokyoDate()}-${Date.now()}.json`);
if(!restore&&existsSync(destination))throw new Error('Backup destination already exists. Choose a new filename.');
const app=createApp({dbPath,mode}),db=app.locals.db;
try {
  if(restore) {
    const backup=JSON.parse(readFileSync(destination,'utf8').replace(/^\uFEFF/,''));
    restoreBackup(db,app.locals.getState,mode,backup);
    console.log(`Restored operational data into ${dbPath}. Sign in with this workspace's administrator account and recreate any additional accounts.`);
  }else{
    db.exec('BEGIN');let backup;
    try{backup=exportBackup(db,app.locals.getState,mode);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify(backup,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});console.log(`Saved operational backup to ${destination}. Passwords and session secrets are excluded.`);
  }
}finally{app.locals.close();}
