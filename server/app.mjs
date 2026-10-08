// SPDX-License-Identifier: AGPL-3.0-only
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { seedState, emptyState, tokyoDate } from './seed.mjs';
import { collections, parseEntity, validateStateChange, validateDelete, HttpError, dateSchema } from './validation.mjs';
import { suggestSchedule } from '../shared/scheduling.mjs';
import { buildExcelExport } from './excel-export.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const publicUser = row => ({id:row.id,name:row.name,username:row.username,role:row.role});
const passwordHash = password => {const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;};
const verifyPassword = (password, stored) => {const [salt,key]=stored.split(':');const expected=Buffer.from(key,'hex'),actual=scryptSync(password,salt,64);return actual.length===expected.length&&timingSafeEqual(actual,expected);};
const strongPassword = value => typeof value==='string' && value.length>=14 && value.length<=256 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^a-zA-Z0-9]/.test(value);
const equalSecret = (actual,expected) => { if(typeof actual!=='string'||typeof expected!=='string')return false;const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);};
const writeMethods = new Set(['POST','PUT','PATCH','DELETE']);

export function createApp(options={}) {
  const mode=options.mode || process.env.APP_MODE || 'demo';
  if (!['demo','production'].includes(mode)) throw new Error('APP_MODE must be demo or production.');
  const demoDate=options.demoDate||process.env.DEMO_DATE||tokyoDate();
  if(!dateSchema.safeParse(demoDate).success)throw new Error('DEMO_DATE must be a valid YYYY-MM-DD date.');
  const appOrigin=options.origin||process.env.APP_ORIGIN;
  if(appOrigin && new URL(appOrigin).origin!==appOrigin)throw new Error('APP_ORIGIN must be an origin without a trailing slash or path.');
  const dbPath=options.dbPath || process.env.DATABASE_PATH || resolve('data',`${mode}.sqlite`);
  if(dbPath!==':memory:')mkdirSync(dirname(resolve(dbPath)),{recursive:true});
  const db=new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities (collection TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(collection,id));
    CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY,timestamp TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,summary TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS audit_timestamp ON audit(timestamp);`);
  const storedMode=db.prepare('SELECT value FROM metadata WHERE key=?').get('mode');
  if(storedMode && storedMode.value!==mode){db.close();throw new Error('Database mode differs from APP_MODE. Use a separate database for production and demo.');}
  const adminPassword=options.adminPassword ?? process.env.ADMIN_PASSWORD;
  const hasAdmin=db.prepare("SELECT id FROM users WHERE role='admin'").get();
  if(mode==='production'&&!hasAdmin&&!strongPassword(adminPassword)){db.close();throw new Error('First production startup requires ADMIN_PASSWORD with at least 14 characters, upper/lowercase letters, a number and a symbol.');}
  function transaction(action){db.exec('BEGIN IMMEDIATE');try{const result=action();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
  function insertEntity(collection,entity){db.prepare('INSERT INTO entities(collection,id,version,data) VALUES(?,?,?,?)').run(collection,entity.id,entity.version,JSON.stringify(entity));}
  function audit(actor,action,entity,entityId,summary){const entry={id:randomUUID(),timestamp:new Date().toISOString(),actor,action,entity,entityId,summary};db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(entry.id,entry.timestamp,actor,action,entity,entityId,summary);return entry;}
  if(!storedMode)transaction(()=>{
    db.prepare('INSERT INTO metadata VALUES(?,?)').run('mode',mode);
    db.prepare('INSERT INTO metadata VALUES(?,?)').run('schema_version','1');
    const state=mode==='demo'?seedState(demoDate):emptyState();
    db.prepare('INSERT INTO metadata VALUES(?,?)').run('locations',JSON.stringify(state.locations));
    for(const collection of collections)for(const entity of state[collection])insertEntity(collection,entity);
    audit('System',mode==='demo'?'seed':'initialize','system',mode,mode==='demo'?'Loaded synthetic demonstration data.':'Initialised an empty production workspace.');
  });
  if(!hasAdmin)transaction(()=>{
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(randomUUID(),'admin','Operations administrator','admin',passwordHash(mode==='demo'?randomBytes(24).toString('hex'):adminPassword));
    if(mode==='demo')for(const role of ['coordinator','viewer'])db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(randomUUID(),role,role==='coordinator'?'Volunteer coordinator':'Operations viewer',role,passwordHash(randomBytes(24).toString('hex')));
  });
  const dummyHash=passwordHash(randomBytes(24).toString('hex'));
  const app=express();app.disable('x-powered-by');
  if(options.trustProxy??process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
  app.locals.db=db;app.locals.mode=mode;app.locals.close=()=>db.close();
  const secureCookies=options.secureCookies??(mode==='production');
  const cookieOptions={httpOnly:true,sameSite:'strict',secure:secureCookies,path:'/',maxAge:12*60*60*1000};
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(mode==='production')res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
    if(writeMethods.has(req.method)&&req.headers.origin){
      const expected=appOrigin||`${req.protocol}://${req.get('host')}`;
      if(req.headers.origin!==expected)return res.status(403).json({error:'Cross-origin writes are not allowed.'});
    }
    next();
  });
  app.use(express.json({limit:'1mb',strict:true}));
  app.use('/api',(req,res,next)=>{
    const cookie=req.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith('vops_session='));
    if(cookie){
      const token=cookie.slice('vops_session='.length);
      if(/^[a-f0-9]{64}$/.test(token)){
        const row=db.prepare('SELECT users.*,sessions.csrf,sessions.expires FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=?').get(hash(token));
        if(row&&row.expires>Date.now()){req.user=publicUser(row);req.csrf=row.csrf;req.sessionHash=hash(token);}
      }
    }
    next();
  });
  const requireAuth=(req,res,next)=>req.user?next():res.status(401).json({error:'Please sign in to continue.'});
  const requireWrite=(req,res,next)=>{
    if(!req.user)return res.status(401).json({error:'Please sign in to continue.'});
    if(req.user.role==='viewer')return res.status(403).json({error:'This action requires a coordinator or administrator.'});
    if(!equalSecret(req.get('x-csrf-token'),req.csrf))return res.status(403).json({error:'The security token is invalid. Refresh the page and try again.'});
    next();
  };
  const requireAdmin=(req,res,next)=>req.user?.role==='admin'?next():res.status(403).json({error:'This action requires an administrator.'});
  const rate=new Map();
  function limitLogin(req,res,next){const key=req.ip,now=Date.now();let value=rate.get(key);if(!value||value.reset<now){if(rate.size>=5000){for(const [k,v]of rate)if(v.reset<now)rate.delete(k);if(!rate.has(key)&&rate.size>=5000){res.setHeader('Retry-After','900');return res.status(429).json({error:'Sign-in is temporarily busy. Try again later.'});}}value={count:0,reset:now+15*60*1000};rate.set(key,value);}value.count++;if(value.count>20){res.setHeader('Retry-After',Math.ceil((value.reset-now)/1000));return res.status(429).json({error:'Too many sign-in attempts. Try again in 15 minutes.'});}next();}
  function establishSession(req,res,user){
    const token=randomBytes(32).toString('hex'),csrfToken=randomBytes(32).toString('hex');
    transaction(()=>{db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());if(req.sessionHash)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),user.id,csrfToken,Date.now()+cookieOptions.maxAge);audit(user.name,'login','session',user.id,'Signed in.');});
    res.cookie('vops_session',token,cookieOptions);res.json({user:publicUser(user),csrfToken,mode});
  }
  app.get('/api/health',(_req,res)=>res.json({status:'ok',mode,version:'1.2.0'}));
  app.get('/api/session',(req,res)=>res.json({user:req.user||null,csrfToken:req.csrf||'',mode}));
  app.post('/api/demo-login',limitLogin,(req,res)=>{
    if(mode!=='demo')throw new HttpError(404,'Demo sign-in is unavailable.');
    const username=['admin','coordinator','viewer'].includes(req.body?.username)?req.body.username:'admin';
    establishSession(req,res,db.prepare('SELECT * FROM users WHERE username=?').get(username));
  });
  app.post('/api/login',limitLogin,(req,res)=>{
    const result=z.object({username:z.string().min(1).max(100),password:z.string().min(1).max(256)}).safeParse(req.body);
    if(!result.success)throw new HttpError(400,'Enter a username and password.');
    const user=db.prepare('SELECT * FROM users WHERE username=?').get(result.data.username);
    const valid=verifyPassword(result.data.password,user?.password_hash||dummyHash);
    if(!user||!valid)throw new HttpError(401,'Username or password is incorrect.');
    establishSession(req,res,user);
  });
  app.post('/api/logout',requireAuth,(req,res)=>{
    if(!equalSecret(req.get('x-csrf-token'),req.csrf))throw new HttpError(403,'The security token is invalid.');
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);res.clearCookie('vops_session',{...cookieOptions,maxAge:undefined});res.json({ok:true});
  });
  function getState(){const state=emptyState();state.locations=JSON.parse(db.prepare('SELECT value FROM metadata WHERE key=?').get('locations').value);for(const collection of collections)state[collection]=db.prepare('SELECT data FROM entities WHERE collection=? ORDER BY rowid').all(collection).map(row=>JSON.parse(row.data));state.audit=db.prepare('SELECT id,timestamp,actor,action,entity,entity_id AS entityId,summary FROM audit ORDER BY rowid DESC LIMIT 1000').all();return state;}
  app.locals.getState=getState;
  app.get('/api/state',requireAuth,(_req,res)=>res.json(getState()));
  function validCollection(value){if(!collections.includes(value))throw new HttpError(404,'Collection was not found.');return value;}
  function getEntity(collection,id){const row=db.prepare('SELECT data FROM entities WHERE collection=? AND id=?').get(collection,id);if(!row)throw new HttpError(404,'Record was not found.');return JSON.parse(row.data);}
  function checkVersion(entity,version){if(!Number.isInteger(version)||entity.version!==version)throw new HttpError(409,'This record changed since it was opened. Refresh and try again.');}
  function replaceEntity(collection,entity){db.prepare('UPDATE entities SET version=?,data=? WHERE collection=? AND id=?').run(entity.version,JSON.stringify(entity),collection,entity.id);}
  app.post('/api/schedule/suggest',requireWrite,(req,res)=>{
    const result=dateSchema.safeParse(req.body?.date);if(!result.success)throw new HttpError(400,'Choose a valid schedule date.');res.json(suggestSchedule(getState(),result.data));
  });
  app.post('/api/schedule/apply',requireWrite,(req,res)=>{
    const parsed=z.object({changes:z.array(z.object({id:z.string().min(1),version:z.number().int().positive(),volunteerIds:z.array(z.string().min(1)).max(50)})).max(300)}).safeParse(req.body);
    if(!parsed.success)throw new HttpError(400,'Invalid schedule changes.');
    if(new Set(parsed.data.changes.map(change=>change.id)).size!==parsed.data.changes.length)throw new HttpError(400,'Each shift may occur only once in a schedule update.');
    const saved=transaction(()=>{
      const state=getState(),updates=[];
      for(const change of parsed.data.changes){const current=getEntity('shifts',change.id);checkVersion(current,change.version);if(['completed','cancelled'].includes(current.status))throw new HttpError(409,'Completed or cancelled shifts cannot be auto-assigned.');const entity=parseEntity('shifts',{...current,volunteerIds:change.volunteerIds,version:current.version+1,updatedAt:new Date().toISOString()});state.shifts=state.shifts.map(shift=>shift.id===entity.id?entity:shift);updates.push(entity);}
      for(const entity of updates)validateStateChange(state,'shifts',entity);
      for(const entity of updates){replaceEntity('shifts',entity);audit(req.user.name,'schedule','shifts',entity.id,`Updated assignments for ${entity.title}.`);}return updates;
    });res.json({updated:saved.length,shifts:saved});
  });
  app.get('/api/export/:filename',requireAuth,(req,res)=>{
    const filename=req.params.filename;if(!filename.endsWith('.csv'))throw new HttpError(404,'CSV export was not found.');
    const collection=validCollection(filename.slice(0,-4));const rows=getState()[collection];
    const headers=rows.length?Object.keys(rows[0]):['id','version'];
    const cell=value=>{let text=Array.isArray(value)&&value.every(item=>item===null||typeof item!=='object')?value.join(' | '):value!==null&&typeof value==='object'?JSON.stringify(value):String(value??'');if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};
    const csv='\uFEFF'+[headers.map(cell).join(','),...rows.map(row=>headers.map(header=>cell(row[header])).join(','))].join('\r\n')+'\r\n';
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="${collection}.csv"`);res.send(csv);
  });
  let excelExportsInFlight=0;
  app.post('/api/export/xlsx',requireAuth,async(req,res)=>{
    // This is a read-only export, available to viewers. POST carries exact row
    // filters; keep the same session CSRF and origin protection as other POSTs.
    if(!equalSecret(req.get('x-csrf-token'),req.csrf))throw new HttpError(403,'The security token is invalid. Refresh the page and try again.');
    if(excelExportsInFlight>=2){res.setHeader('Retry-After','5');throw new HttpError(429,'Excel exports are busy. Try again in a few seconds.');}
    excelExportsInFlight++;
    try{
      const result=await buildExcelExport(getState(),req.body,{mode});
      res.setHeader('Content-Type',result.mime);res.setHeader('Content-Disposition',`attachment; filename="${result.filename}"`);res.send(result.buffer);
    }finally{excelExportsInFlight--;}
  });
  app.get('/api/backup',requireAuth,requireAdmin,(req,res)=>{
    const state=getState();state.audit=db.prepare('SELECT id,timestamp,actor,action,entity,entity_id AS entityId,summary FROM audit ORDER BY rowid').all();
    res.setHeader('Content-Disposition',`attachment; filename="shuori-backup-${tokyoDate()}.json"`);res.json({format:'shuori-backup',schemaVersion:1,exportedAt:new Date().toISOString(),mode,state,users:db.prepare('SELECT id,name,username,role FROM users').all()});
  });
  app.get('/api/users',requireAuth,requireAdmin,(_req,res)=>res.json(db.prepare('SELECT id,name,username,role FROM users ORDER BY username').all()));
  app.post('/api/users',requireWrite,requireAdmin,(req,res)=>{
    const parsed=z.object({username:z.string().regex(/^[a-zA-Z0-9_.-]{3,50}$/),name:z.string().trim().min(1).max(160),role:z.enum(['admin','coordinator','viewer']),password:z.string().refine(strongPassword,'Use at least 14 characters, upper/lowercase letters, a number and a symbol.')}).safeParse(req.body);
    if(!parsed.success)throw new HttpError(400,parsed.error.issues.map(issue=>issue.message).join(' '));
    const value=parsed.data;if(db.prepare('SELECT id FROM users WHERE username=?').get(value.username))throw new HttpError(409,'Username is already in use.');
    const user={id:randomUUID(),username:value.username,name:value.name,role:value.role};transaction(()=>{db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.id,user.username,user.name,user.role,passwordHash(value.password));audit(req.user.name,'create','users',user.id,`Created ${user.role} account ${user.username}.`);});res.status(201).json(user);
  });
  app.put('/api/users/:id',requireWrite,requireAdmin,(req,res)=>{
    const user=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);if(!user)throw new HttpError(404,'User was not found.');
    const parsed=z.object({name:z.string().trim().min(1).max(160).optional(),role:z.enum(['admin','coordinator','viewer']).optional(),password:z.string().refine(strongPassword,'Use at least 14 characters, upper/lowercase letters, a number and a symbol.').optional()}).strict().safeParse(req.body);
    if(!parsed.success)throw new HttpError(400,'Invalid account update or password strength.');
    const value={...user,...parsed.data};if(user.role==='admin'&&value.role!=='admin'&&db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n<=1)throw new HttpError(409,'At least one administrator must remain.');
    transaction(()=>{db.prepare('UPDATE users SET name=?,role=?,password_hash=? WHERE id=?').run(value.name,value.role,value.password?passwordHash(value.password):user.password_hash,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);audit(req.user.name,'update','users',user.id,`Updated account ${user.username}; active sessions revoked.`);});res.json(publicUser(value));
  });
  app.post('/api/:collection',requireWrite,(req,res)=>{
    const collection=validCollection(req.params.collection),now=new Date().toISOString();
    const entity=parseEntity(collection,{...req.body,id:randomUUID(),version:1,createdAt:now,updatedAt:now});
    transaction(()=>{const state=getState();state[collection].push(entity);validateStateChange(state,collection,entity);insertEntity(collection,entity);audit(req.user.name,'create',collection,entity.id,`Created ${entity.title||entity.name||collection.slice(0,-1)}.`);});res.status(201).json(entity);
  });
  app.put('/api/:collection/:id',requireWrite,(req,res)=>{
    const collection=validCollection(req.params.collection);
    const entity=transaction(()=>{const current=getEntity(collection,req.params.id);checkVersion(current,req.body?.version);const updated=parseEntity(collection,{...current,...req.body,id:current.id,version:current.version+1,createdAt:current.createdAt,updatedAt:new Date().toISOString()});const state=getState();state[collection]=state[collection].map(item=>item.id===current.id?updated:item);validateStateChange(state,collection,updated);replaceEntity(collection,updated);audit(req.user.name,'update',collection,updated.id,`Updated ${updated.title||updated.name||collection.slice(0,-1)}.`);return updated;});res.json(entity);
  });
  app.delete('/api/:collection/:id',requireWrite,(req,res)=>{
    const collection=validCollection(req.params.collection);transaction(()=>{const entity=getEntity(collection,req.params.id);checkVersion(entity,req.body?.version);validateDelete(getState(),collection,entity.id);db.prepare('DELETE FROM entities WHERE collection=? AND id=?').run(collection,entity.id);audit(req.user.name,'delete',collection,entity.id,`Deleted ${entity.title||entity.name||collection.slice(0,-1)}.`);});res.json({ok:true});
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint was not found.'}));
  const distPath=options.distPath||resolve('dist');
  if(existsSync(resolve(distPath,'index.html'))){app.use(express.static(distPath,{index:false}));app.get('/{*path}',(_req,res)=>res.sendFile(resolve(distPath,'index.html')));}
  app.use((error,_req,res,_next)=>{if(error.status&&error.status<500)return res.status(error.status).json({error:error.type==='entity.parse.failed'?'Invalid JSON request.':error.type==='entity.too.large'?'Request is too large.':error.message});console.error('Request failed:',error);res.status(500).json({error:'The request could not be completed. Please try again.'});});
  return app;
}
