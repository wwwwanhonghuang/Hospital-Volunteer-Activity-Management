// SPDX-License-Identifier: AGPL-3.0-only
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { collections, parseEntity, validateStateChange } from '../server/validation.mjs';
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
    if(!['shuori-backup','komorebi-backup'].includes(backup.format)||backup.schemaVersion!==1||backup.mode!==mode)throw new Error('Backup format, schema version or operating mode does not match this workspace.');
    if(db.prepare('SELECT COUNT(*) AS count FROM entities').get().count>0)throw new Error('Restore requires an empty workspace. Use a new DATABASE_PATH with APP_MODE=production and ADMIN_PASSWORD to initialise an empty production workspace.');
    const state=backup.state;
    if(!state||!Array.isArray(state.locations)||!Array.isArray(state.audit))throw new Error('Backup is missing locations or audit history.');
    // Schema 1 backups made before Spatial Studio contain no scenario collection.
    if(state.scenarios===undefined)state.scenarios=[];
    for(const collection of collections){if(!Array.isArray(state[collection]))throw new Error(`Backup is missing ${collection}.`);state[collection]=state[collection].map(value=>{const parsed=parseEntity(collection,value);if(!parsed.id||!parsed.version)throw new Error('Backup entity identifiers and versions are required.');return parsed;});}
    // Locations come from the trusted installed application, while entities retain their links.
    state.locations=app.locals.getState().locations;
    for(const collection of collections)for(const entity of state[collection])validateStateChange(state,collection,entity,{checkEligibility:false});
    db.exec('BEGIN IMMEDIATE');
    try {
      for(const collection of collections)for(const entity of state[collection])db.prepare('INSERT INTO entities VALUES(?,?,?,?)').run(collection,entity.id,entity.version,JSON.stringify(entity));
      for(const entry of state.audit){if(!['id','timestamp','actor','action','entity','entityId','summary'].every(key=>typeof entry[key]==='string'&&entry[key].length<=4000))throw new Error('Invalid audit entry.');db.prepare('INSERT OR IGNORE INTO audit VALUES(?,?,?,?,?,?,?)').run(entry.id,entry.timestamp,entry.actor,entry.action,entry.entity,entry.entityId,entry.summary);}
      db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),'System','restore','system',mode,'Restored operational data from a validated JSON backup. User credentials were not imported.');
      db.prepare('DELETE FROM sessions').run();db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    console.log(`Restored operational data into ${dbPath}. Sign in with this workspace's administrator account and recreate any additional accounts.`);
  }else{
    db.exec('BEGIN');let backup;
    try{const state=app.locals.getState();state.audit=db.prepare('SELECT id,timestamp,actor,action,entity,entity_id AS entityId,summary FROM audit ORDER BY rowid').all();backup={format:'shuori-backup',schemaVersion:1,exportedAt:new Date().toISOString(),mode,state,users:db.prepare('SELECT id,name,username,role FROM users').all()};db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify(backup,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});console.log(`Saved operational backup to ${destination}. Passwords and session secrets are excluded.`);
  }
}finally{app.locals.close();}
