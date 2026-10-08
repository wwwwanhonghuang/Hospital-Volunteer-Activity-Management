// SPDX-License-Identifier: AGPL-3.0-only
import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { attachmentTargets, HttpError, parseEntity, safeHttpsUrl, validateStateChange } from './validation.mjs';

export const MAX_ATTACHMENT_BYTES=10*1024*1024;
export const MAX_STORAGE_BYTES=250*1024*1024;
export const MAX_TARGET_ATTACHMENTS=200;
const fileTypes={pdf:'application/pdf',txt:'text/plain',csv:'text/csv',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',doc:'application/msword',xls:'application/vnd.ms-excel',ppt:'application/vnd.ms-powerpoint'};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateAttachmentFilename(value) {
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>160||/[\u0000-\u001f\u007f<>:"/\\|?*]/.test(value)||/[. ]$/.test(value)||value==='.'||value==='..'||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))throw new HttpError(400,'Use a filename of at most 160 characters without paths or control characters.');
  const extension=value.split('.').pop().toLowerCase();if(!Object.hasOwn(fileTypes,extension))throw new HttpError(400,'Allowed files: PDF, Office documents, CSV, TXT, PNG, JPEG and WebP.');
  return {extension,contentType:fileTypes[extension]};
}
export function validateAttachmentBytes(filename,bytes) {
  const {extension,contentType}=validateAttachmentFilename(filename);
  if(!Buffer.isBuffer(bytes)||!bytes.length)throw new HttpError(400,'Choose a non-empty file.');
  if(bytes.length>MAX_ATTACHMENT_BYTES)throw new HttpError(413,'Each file must be 10 MiB or smaller.');
  const starts=signature=>bytes.subarray(0,signature.length).equals(Buffer.from(signature));
  let valid=true;
  if(extension==='pdf')valid=bytes.subarray(0,5).toString()==='%PDF-';
  if(extension==='png')valid=starts([137,80,78,71,13,10,26,10]);
  if(['jpg','jpeg'].includes(extension))valid=starts([255,216,255]);
  if(extension==='webp')valid=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(['docx','xlsx','pptx'].includes(extension))valid=starts([80,75,3,4]);
  if(['doc','xls','ppt'].includes(extension))valid=starts([208,207,17,224,161,177,26,225]);
  if(['txt','csv'].includes(extension))valid=!bytes.includes(0)&&!bytes.toString('utf8').includes('\uFFFD');
  if(!valid)throw new HttpError(400,'The file contents do not match the selected document type.');
  return {contentType,sha256:sha256(bytes)};
}
export function validateAttachmentBlob(metadata,bytes) {
  const details=validateAttachmentBytes(metadata.name,bytes);
  if(metadata.kind!=='file'||metadata.url!==''||metadata.size!==bytes.length||metadata.sha256!==details.sha256||metadata.contentType!==details.contentType)throw new HttpError(400,'Attachment metadata does not match its stored file.');
}

export function installAttachmentRoutes(app,{db,requireAuth,requireWrite,transaction,getState,getEntity,checkVersion,insertEntity,audit}) {
  const targetSchema=z.object({targetType:z.enum(attachmentTargets),targetId:z.string().min(1).max(160)});
  const targetFor=value=>{const result=targetSchema.safeParse(value);if(!result.success)throw new HttpError(400,'Choose a supported attachment target.');getEntity(result.data.targetType,result.data.targetId);return result.data;};
  const checkCapacity=(target,size=0)=>{const count=db.prepare("SELECT COUNT(*) AS n FROM entities WHERE collection='attachments' AND json_extract(data,'$.targetType')=? AND json_extract(data,'$.targetId')=?").get(target.targetType,target.targetId).n;if(count>=MAX_TARGET_ATTACHMENTS)throw new HttpError(409,'This record already has 200 attachments. Remove an attachment before adding another.');const used=db.prepare('SELECT COALESCE(SUM(length(bytes)),0) AS size FROM attachment_blobs').get().size;if(used+size>MAX_STORAGE_BYTES)throw new HttpError(413,'Workspace file storage is full (250 MiB). Remove unused files before uploading more.');};
  app.get('/api/storage',requireAuth,(_req,res)=>res.json({provider:'sqlite',maxFileBytes:MAX_ATTACHMENT_BYTES,maxStorageBytes:MAX_STORAGE_BYTES,maxTargetAttachments:MAX_TARGET_ATTACHMENTS,usedBytes:db.prepare('SELECT COALESCE(SUM(length(bytes)),0) AS size FROM attachment_blobs').get().size,fileCount:db.prepare('SELECT COUNT(*) AS n FROM attachment_blobs').get().n,extensions:Object.keys(fileTypes)}));
  app.post('/api/attachments/upload',requireWrite,(req,_res,next)=>{
    req.attachmentTarget=targetFor(req.query);validateAttachmentFilename(req.query.filename);
    if(!req.is('application/octet-stream'))throw new HttpError(415,'Upload file bytes as application/octet-stream.');
    if(Number(req.get('content-length'))>MAX_ATTACHMENT_BYTES)throw new HttpError(413,'Each file must be 10 MiB or smaller.');
    if(typeof req.query.description!=='undefined'&&(typeof req.query.description!=='string'||req.query.description.length>4000))throw new HttpError(400,'Attachment description is too long.');
    checkCapacity(req.attachmentTarget);next();
  },express.raw({type:'application/octet-stream',limit:MAX_ATTACHMENT_BYTES,inflate:false}),(req,res)=>{
    const details=validateAttachmentBytes(req.query.filename,req.body),now=new Date().toISOString();
    const entity=parseEntity('attachments',{id:randomUUID(),version:1,createdAt:now,updatedAt:now,...req.attachmentTarget,name:req.query.filename,kind:'file',url:'',description:req.query.description||'',size:req.body.length,...details,uploadedBy:req.user.name});
    transaction(()=>{checkCapacity(req.attachmentTarget,req.body.length);validateStateChange(getState(),'attachments',entity);insertEntity('attachments',entity);db.prepare('INSERT INTO attachment_blobs(id,bytes) VALUES(?,?)').run(entity.id,req.body);audit(req.user.name,'upload','attachments',entity.id,`Uploaded ${entity.name} to ${entity.targetType}/${entity.targetId}.`);});res.status(201).json(entity);
  });
  app.post('/api/attachments/link',requireWrite,(req,res)=>{
    const target=targetFor(req.body),result=z.object({name:z.string().trim().min(1).max(160),url:safeHttpsUrl,description:z.string().trim().max(4000).default('')}).safeParse(req.body);
    if(!result.success)throw new HttpError(400,result.error.issues.map(value=>value.message).join(' '));
    const now=new Date().toISOString(),entity=parseEntity('attachments',{id:randomUUID(),version:1,createdAt:now,updatedAt:now,...target,...result.data,kind:'link',uploadedBy:req.user.name});
    transaction(()=>{checkCapacity(target);validateStateChange(getState(),'attachments',entity);insertEntity('attachments',entity);audit(req.user.name,'create','attachments',entity.id,`Linked ${entity.name} to ${entity.targetType}/${entity.targetId}.`);});res.status(201).json(entity);
  });
  app.get('/api/attachments/:id/download',requireAuth,(req,res)=>{
    const entity=getEntity('attachments',req.params.id);if(entity.kind!=='file')throw new HttpError(400,'This attachment is an external link.');
    const stored=db.prepare('SELECT bytes FROM attachment_blobs WHERE id=?').get(entity.id);if(!stored)throw new HttpError(404,'Attachment file was not found.');
    const fallback=entity.name.replace(/[^a-zA-Z0-9._ -]/g,'_');
    res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',`attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(entity.name).replace(/['()*]/g,value=>`%${value.charCodeAt(0).toString(16).toUpperCase()}`)}`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.send(Buffer.from(stored.bytes));
  });
  app.delete('/api/attachments/:id',requireWrite,(req,res)=>{
    transaction(()=>{const entity=getEntity('attachments',req.params.id);checkVersion(entity,req.body?.version);db.prepare('DELETE FROM attachment_blobs WHERE id=?').run(entity.id);db.prepare("DELETE FROM entities WHERE collection='attachments' AND id=?").run(entity.id);audit(req.user.name,'delete','attachments',entity.id,`Removed attachment ${entity.name} from ${entity.targetType}/${entity.targetId}.`);});res.json({ok:true});
  });
}
