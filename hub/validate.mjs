import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
const fail=message=>{throw Error(message)};
const readJSON=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
// Collections are finite, source-referenced public topics, independent of four-domain digests.
export function validateCollection(data,item){
  const bad=message=>fail(`Invalid collection ${item.id}: ${message}`);
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const text=value=>typeof value==='string'&&value.trim().length>0;
  const date=(value,required=false)=>{
    if(value===null&&!required)return;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))bad('invalid date');
    const day=value.slice(0,10),parts=day.split('-').map(Number),d=new Date(`${day}T00:00:00Z`);
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day||parts[0]<1||value.length>10&&!Number.isFinite(Date.parse(value)))bad('nonexistent date');
    if(value.length>10){const time=value.slice(11,19).split(':').map(Number);if(time[0]>23||time[1]>59||time[2]>59)bad('invalid time');}
  };
  if(!object(data)||data.schemaVersion!==1||data.id!==item.id||!['partial','ready'].includes(data.status))bad('schema/id/status');
  if(item.coverage!==data.status)bad('catalog coverage differs from business status');
  if(item.status!=='ready')bad('collection catalog must declare availability separately as ready');
  for(const key of ['items','sources','metrics'])if(!Array.isArray(data[key]))bad(`${key} must be an array`);
  if(!object(data.coverage)||!text(data.coverage.summary)||!Array.isArray(data.coverage.gaps)||data.coverage.gaps.some(v=>!text(v)))bad('coverage explanation');
  date(data.generatedAt,true);if(data.generatedAt.length===10)bad('generatedAt requires timezone');date(data.sourceAsOf);
  if(item.generatedAt!==data.generatedAt||item.sourceAsOf!==data.sourceAsOf)bad('catalog timestamps differ');
  const sourceIds=new Set();
  for(const source of data.sources){if(!object(source)||!text(source.id)||sourceIds.has(source.id)||!text(source.label))bad('missing/duplicate source id');sourceIds.add(source.id);date(source.asOf);}
  const itemIds=new Set();
  for(const entry of data.items){if(!object(entry)||!text(entry.id)||itemIds.has(entry.id)||!text(entry.title)||!text(entry.status)||!sourceIds.has(entry.sourceId))bad('item identity/source');itemIds.add(entry.id);date(entry.date);if(!Array.isArray(entry.tags)||entry.tags.some(v=>!text(v)))bad('item tags');}
  const metricIds=new Set();
  for(const metric of data.metrics){if(!object(metric)||!text(metric.label)||!(metric.value===null||typeof metric.value==='number'&&Number.isFinite(metric.value)))bad('metric value must be finite or null');if(metric.id!==undefined){if(!text(metric.id)||metricIds.has(metric.id))bad('duplicate metric id');metricIds.add(metric.id);}if(metric.sourceId!==undefined&&!sourceIds.has(metric.sourceId))bad('metric source');if(metric.asOf!==undefined)date(metric.asOf);}
  const walk=value=>{if(typeof value==='number'&&!Number.isFinite(value))bad('non-finite number');if(Array.isArray(value))value.forEach(walk);else if(object(value))for(const [key,child]of Object.entries(value)){if(key==='sourceId'&&!sourceIds.has(child))bad('unresolved sourceId');if(['date','asOf','sourceAsOf','dueDate','weekOf'].includes(key))date(child);walk(child);}};
  walk(data);
  if(!Number.isSafeInteger(item.records)||item.records!==data.items.length)bad('catalog count differs');
  return data.items.length;
}
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
  if(item.bytes!==buffer.length) fail('Dataset byte count mismatch');
  const data=JSON.parse(buffer.toString());
  const count=item.type==='snapshot'
    ?Object.values(data.queries||{}).reduce((sum,query)=>{if(!Array.isArray(query.rows))fail('Invalid query rows');return sum+query.rows.length},0)
    :item.type==='ledger'?(data.schema_version==='unified-finance/1.0'&&Array.isArray(data.records)?data.records.length:fail('Invalid unified ledger'))
    :item.type==='collection'?validateCollection(data,item)
    :item.type==='digest'?(data.schemaVersion===1&&data.id===item.id&&Array.isArray(data.items)&&['ready','partial'].includes(data.status)?data.items.length:fail('Invalid life digest'))
    :item.type==='index'&&Array.isArray(data.entries)?data.entries.length:fail('Invalid dataset type or index entries');
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
