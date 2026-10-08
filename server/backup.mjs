// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { collections, parseEntity, validateStateChange } from './validation.mjs';
import { MAX_ATTACHMENT_BYTES, MAX_STORAGE_BYTES, MAX_TARGET_ATTACHMENTS, validateAttachmentBlob } from './attachments.mjs';

export function exportBackup(db,getState,mode) {
  const state=getState();state.audit=db.prepare('SELECT id,timestamp,actor,action,entity,entity_id AS entityId,summary FROM audit ORDER BY rowid').all();
  return {format:'shuori-backup',schemaVersion:1,exportedAt:new Date().toISOString(),mode,state,attachmentBlobs:db.prepare('SELECT id,bytes FROM attachment_blobs ORDER BY id').all().map(value=>({id:value.id,data:Buffer.from(value.bytes).toString('base64')})),users:db.prepare('SELECT id,name,username,role FROM users').all()};
}

export function restoreBackup(db,getState,mode,backup) {
  if(!['shuori-backup','komorebi-backup'].includes(backup?.format)||backup.schemaVersion!==1||backup.mode!==mode)throw new Error('Backup format, schema version or operating mode does not match this workspace.');
  if(db.prepare('SELECT COUNT(*) AS count FROM entities').get().count>0)throw new Error('Restore requires an empty workspace. Use a new DATABASE_PATH with APP_MODE=production and ADMIN_PASSWORD to initialise an empty production workspace.');
  const state=structuredClone(backup.state);
  if(!state||!Array.isArray(state.locations)||!Array.isArray(state.audit))throw new Error('Backup is missing locations or audit history.');
  for(const collection of ['scenarios','events','eventTypes','fieldDefinitions','entries','attachments'])if(state[collection]===undefined)state[collection]=[];
  for(const collection of collections){if(!Array.isArray(state[collection]))throw new Error(`Backup is missing ${collection}.`);const ids=new Set();state[collection]=state[collection].map(value=>{const parsed=parseEntity(collection,value);if(!parsed.id||!parsed.version)throw new Error('Backup entity identifiers and versions are required.');if(ids.has(parsed.id))throw new Error('Backup contains duplicate record identifiers.');ids.add(parsed.id);return parsed;});}
  state.locations=getState().locations;
  for(const collection of collections)for(const entity of state[collection])validateStateChange(state,collection,entity,{checkEligibility:false,checkRequired:false});
  for(const entry of state.audit)if(!['id','timestamp','actor','action','entity','entityId','summary'].every(key=>typeof entry[key]==='string'&&entry[key].length<=4000))throw new Error('Invalid audit entry.');
  if(backup.attachmentBlobs!==undefined&&!Array.isArray(backup.attachmentBlobs))throw new Error('Invalid attachment backup data.');
  const blobs=new Map();let total=0;
  for(const blob of backup.attachmentBlobs||[]){if(typeof blob?.id!=='string'||typeof blob.data!=='string'||blob.data.length>Math.ceil(MAX_ATTACHMENT_BYTES/3)*4||!blob.data.length||blob.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(blob.data)||blobs.has(blob.id))throw new Error('Invalid or duplicate attachment blob.');const bytes=Buffer.from(blob.data,'base64');if(bytes.toString('base64')!==blob.data)throw new Error('Invalid attachment encoding.');const metadata=state.attachments.find(value=>value.id===blob.id);if(!metadata)throw new Error('Attachment blob has no metadata.');validateAttachmentBlob(metadata,bytes);total+=bytes.length;if(total>MAX_STORAGE_BYTES)throw new Error('Backup exceeds the workspace file storage limit.');blobs.set(blob.id,bytes);}
  const targetCounts=new Map();
  for(const metadata of state.attachments){const key=JSON.stringify([metadata.targetType,metadata.targetId]),count=(targetCounts.get(key)||0)+1;targetCounts.set(key,count);if(count>MAX_TARGET_ATTACHMENTS)throw new Error('Backup exceeds the limit of 200 attachments per record.');if(metadata.kind==='file'&&!blobs.has(metadata.id))throw new Error('Backup is missing an attachment file.');if(metadata.kind==='link'&&(!metadata.url||metadata.size!==0||metadata.sha256!==''||metadata.contentType!==''))throw new Error('External link metadata is invalid.');}
  db.exec('BEGIN IMMEDIATE');
  try{
    // Validation happens before acquiring the write lock. Recheck under the lock
    // so a concurrent service cannot turn an empty restore into an accidental merge.
    if(db.prepare('SELECT COUNT(*) AS count FROM entities').get().count>0)throw new Error('Restore requires an empty workspace. The destination changed during validation.');
    for(const collection of collections)for(const entity of state[collection])db.prepare('INSERT INTO entities VALUES(?,?,?,?)').run(collection,entity.id,entity.version,JSON.stringify(entity));
    for(const [id,bytes]of blobs)db.prepare('INSERT INTO attachment_blobs(id,bytes) VALUES(?,?)').run(id,bytes);
    for(const entry of state.audit)db.prepare('INSERT OR IGNORE INTO audit VALUES(?,?,?,?,?,?,?)').run(entry.id,entry.timestamp,entry.actor,entry.action,entry.entity,entry.entityId,entry.summary);
    db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),'System','restore','system',mode,'Restored validated operational data and attachment files. User credentials were not imported.');
    db.prepare('DELETE FROM sessions').run();db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
