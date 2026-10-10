// SPDX-License-Identifier: AGPL-3.0-only
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { join, resolve } from 'node:path';

// Explicit inclusion keeps credentials, live databases and installed dependencies out of releases.
const directories=['src','server','shared','public','dist','docs','deploy','content','LICENSES','meta','tests','scripts','.github','artifacts/models','artifacts/previews','artifacts/exports','artifacts/qa'];
const singleFiles=['package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','playwright.config.ts','README.md','CONTRIBUTING.md','LICENSE','NOTICE','Start-SHUORI.cmd','Start-Komorebi.cmd','Dockerfile','compose.yaml','.dockerignore','.gitignore','.gitattributes','.env.example','artifacts/spatial-validation.json'];
const root=resolve('.');const pkg=JSON.parse(await readFile('package.json','utf8'));const prefix=`shuori-${pkg.version}`;
await stat('dist/index.html');await stat('artifacts/models/hospital-public-floors.glb');await stat('docs/VERIFICATION.md');
const entries=[];
async function collect(directory){for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(directory,entry.name);if(entry.isDirectory())await collect(path);else if(entry.isFile()&&!entry.name.endsWith('.log'))entries.push({path:path.replaceAll('\\','/'),data:await readFile(path)});}}
for(const directory of directories)await collect(directory);
for(const path of singleFiles)entries.push({path,data:await readFile(path)});
entries.sort((a,b)=>a.path.localeCompare(b.path));
if(new Set(entries.map(e=>e.path)).size!==entries.length)throw new Error('Duplicate paths in release.');
const digest=data=>createHash('sha256').update(data).digest('hex');
const manifest=entries.map(e=>`${digest(e.data)}  ${e.path}`).join('\n')+'\n';
entries.push({path:'MANIFEST.sha256',data:Buffer.from(manifest)});
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(data){let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const now=new Date();const date=((now.getUTCFullYear()-1980)<<9)|((now.getUTCMonth()+1)<<5)|now.getUTCDate();const time=(now.getUTCHours()<<11)|(now.getUTCMinutes()<<5)|(now.getUTCSeconds()>>1);
const chunks=[],central=[];let offset=0;
for(const entry of entries){
 const name=Buffer.from(`${prefix}/${entry.path}`);const data=deflateRawSync(entry.data,{level:9});const crc=crc32(entry.data);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(time,10);local.writeUInt16LE(date,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(entry.data.length,22);local.writeUInt16LE(name.length,26);
 const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt16LE(8,10);dir.writeUInt16LE(time,12);dir.writeUInt16LE(date,14);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(entry.data.length,24);dir.writeUInt16LE(name.length,28);dir.writeUInt32LE(offset,42);
 chunks.push(local,name,data);central.push(dir,name);offset+=local.length+name.length+data.length;
}
const centralBytes=Buffer.concat(central);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...chunks,centralBytes,end]);const destination=`artifacts/releases/${prefix}.zip`;
await mkdir('artifacts/releases',{recursive:true});await writeFile(destination,archive);
const report={version:pkg.version,createdAt:now.toISOString(),archive:destination,bytes:archive.length,sha256:digest(archive),files:entries.length,includes:['Source','Compiled application','Standalone GLB','Preview images','Documentation','Tests and QA evidence'],excludes:['Operational databases','Credentials','node_modules','Official map images']};
await writeFile(`artifacts/releases/${prefix}.sha256`,`${report.sha256}  ${prefix}.zip\n`);await writeFile('artifacts/releases/release-info.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
