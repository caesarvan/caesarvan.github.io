import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
const fail=message=>{throw Error(message)};
const readJSON=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const manifest=await readJSON('modules.json');
if(manifest.version!==1||!Array.isArray(manifest.modules)) fail('Invalid module registry');
const ids=new Set();let pageEntries=0;
for(const m of manifest.modules){
  if(!/^[a-z][a-z0-9-]*$/.test(m.id)||ids.has(m.id)) fail('Invalid or duplicate id');
  ids.add(m.id);
  for(const key of ['title','description','icon','group']) if(typeof m[key]!=='string'||!m[key].trim()) fail('Missing module metadata');
  if(!/^#[0-9a-f]{6}$/i.test(m.color)||typeof m.enabled!=='boolean'||!Number.isFinite(m.order)) fail('Invalid module metadata');
  if(m.type==='page'){
    if(!/^\.\/pages\/[a-z0-9-]+\/index\.html(?:\?[^#]*)?$/.test(m.href)) fail('Page outside module directory');
    await stat(path.join(root,new URL(m.href,'https://example.test/').pathname.slice(1)));
    pageEntries++;
  }else if(m.type==='link'){
    const url=new URL(m.href);
    if(url.protocol!=='https:'||url.username||url.password) fail('Invalid external URL');
  }else fail('Unknown module type');
}
const catalog=await readJSON('data/datasets.json');
if(catalog.version!==1||!Array.isArray(catalog.datasets)) fail('Invalid dataset catalog');
const dataIds=new Set();let records=0,unavailable=0;
for(const item of catalog.datasets){
  if(dataIds.has(item.id)||!ids.has(item.id)||!/^\.\/[a-z0-9-]+\.json$/.test(item.file)) fail('Invalid dataset entry');
  dataIds.add(item.id);
  const file=path.join(root,'data',item.file),buffer=await readFile(file);
  if(createHash('sha256').update(buffer).digest('hex')!==item.sha256) fail('Dataset checksum mismatch');
  const data=JSON.parse(buffer.toString());
  const count=item.type==='snapshot'
    ?Object.values(data.queries||{}).reduce((sum,query)=>{if(!Array.isArray(query.rows))fail('Invalid query rows');return sum+query.rows.length},0)
    :Array.isArray(data.entries)?data.entries.length:fail('Invalid index entries');
  if(count!==item.records) fail('Dataset count mismatch');
  if(item.status==='unavailable'){if(count!==0)fail('Unavailable dataset has records');unavailable++}
  else if(item.status!=='ready') fail('Invalid availability state');
  records+=count;
}
for(const m of manifest.modules) if(m.enabled&&m.mode==='published'&&!dataIds.has(m.id)) fail('Published module missing data');
let files=0,bytes=0;
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(/private-data|node_modules|\.env|\.map$|^evidence$|^work$/.test(entry.name)||entry.isSymbolicLink())fail('Unexpected private/build file');
    if(entry.isDirectory()){await walk(file);continue}
    files++;const buffer=await readFile(file);bytes+=buffer.length;
    if(buffer.length>50*1024*1024)fail('File exceeds publication size limit');
    if(/\.(mjs|js)$/.test(entry.name))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
    if(entry.name.endsWith('.html')){
      const source=buffer.toString();
      if(!/<html[^>]+lang=/i.test(source)||!/<title>.+?<\/title>/is.test(source))fail('HTML metadata missing');
      if(source.includes('/Users/caesar/')||source.includes('localhost:')||source.includes('127.0.0.1:'))fail('Local path in public HTML');
    }
    if(entry.name.endsWith('.json')&&/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/.test(buffer.toString()))fail('Possible credential in JSON');
  }
}
await walk(root);
console.log(JSON.stringify({result:'passed',modules:ids.size,pageEntries,datasets:dataIds.size,unavailable,records,files,bytes}));
