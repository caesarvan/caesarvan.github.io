import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(process.argv[2]||path.dirname(fileURLToPath(import.meta.url)));
const failures=[];const fail=message=>failures.push(message);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'modules.json'),'utf8'));
const icons=['grid','sparkles','wallet','chart','plane','calendar','heart','home','book','layers','plus','arrow-up-right','arrow-right','arrow-left','chevron-right','chevron-left','search','moon','sun','bell','menu','more','close','check','clock','sliders','eye','eye-off','trending-up','coffee','bag','train','map-pin','leaf','droplet','activity','inbox','note','refresh','external','settings','download','check-circle','filter','shield'];
const views=['overview','assistant','finance','investment','travel','calendar','health','family','apps'];
const ids=new Set(),targets=new Set();
if(manifest.version!==1||!Array.isArray(manifest.modules))throw Error('模块注册表必须包含 version:1 与 modules 数组');
for(const m of manifest.modules){
  if(!m||typeof m!=='object'){fail('存在非对象模块');continue}
  if(!/^[a-z][a-z0-9-]*$/.test(m.id||''))fail(`非法模块 ID：${m.id}`);
  if(ids.has(m.id))fail(`重复模块 ID：${m.id}`);ids.add(m.id);
  if(typeof m.title!=='string'||!m.title.trim()||m.title.length>40)fail(`${m.id}：名称应为1—40字`);
  if(typeof m.description!=='string')fail(`${m.id}：缺少描述`);
  if(!/^#[0-9a-f]{6}$/i.test(m.color||''))fail(`${m.id}：颜色应为六位十六进制`);
  if(!icons.includes(m.icon))fail(`${m.id}：未知图标 ${m.icon}`);
  if(!['builtin','page','link'].includes(m.type))fail(`${m.id}：未知模块类型`);
  if(!['core','extension'].includes(m.group))fail(`${m.id}：group 应为 core 或 extension`);
  if(!Number.isFinite(m.order)||typeof m.enabled!=='boolean')fail(`${m.id}：缺少有效 order 或 enabled`);
  if(m.type==='builtin'&&!views.includes(m.view))fail(`${m.id}：未知内置视图 ${m.view}`);
  if(m.type==='page'){
    if(typeof m.href!=='string'||!/^\.\/pages\/[a-z0-9-]+\/index\.html$/.test(m.href)){fail(`${m.id}：独立页必须为 ./pages/<slug>/index.html`);continue}
    const target=path.resolve(root,m.href);if(!fs.existsSync(target))fail(`${m.id}：页面不存在 ${m.href}`);
    if(targets.has(target))fail(`${m.id}：与其他模块使用重复页面路径`);targets.add(target);
  }
  if(m.type==='link'){try{const u=new URL(m.href);if(u.protocol!=='https:'||u.username||u.password)throw Error()}catch{fail(`${m.id}：外部地址应为不带凭据的 HTTPS URL`)}}
}
if(!manifest.modules.some(m=>m.id==='overview'&&m.enabled))fail('必须有启用的 overview 模块');
const all=[];function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){if(f.name.startsWith('.'))continue;const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else all.push(p)}}walk(root);
let references=0;for(const file of all){
  const relative=path.relative(root,file);const ext=path.extname(file);if(['.js','.mjs'].includes(ext)){try{execFileSync(process.execPath,['--check',file],{stdio:'pipe'})}catch(e){fail(`${relative}：JS 语法检查失败 ${e.stderr?.toString()||e.message}`)}}
  if(!['.html','.css','.js','.mjs'].includes(ext)||relative==='validate.mjs')continue;
  const source=fs.readFileSync(file,'utf8');const links=[];
  if(ext==='.html'){for(const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g))links.push(match[1]);if(!/<html\b[^>]*\blang=/.test(source))fail(`${relative}：缺少页面语言`);if(!/<title>[^<]+<\/title>/.test(source))fail(`${relative}：缺少标题`)}
  if(ext==='.css'){for(const match of source.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g))links.push(match[1])}
  if(ext==='.js'){for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g))links.push(match[1]);for(const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g))links.push(match[1])}
  for(const link of links){if(/^(https?:|data:|#|mailto:|tel:)/.test(link)||link.includes('${'))continue;const clean=link.split(/[?#]/)[0];if(!clean)continue;const target=path.resolve(path.dirname(file),clean);references++;if(!target.startsWith(root+path.sep)&&target!==root)fail(`${relative}：资源超出子站目录 ${link}`);if(!fs.existsSync(target))fail(`${relative}：本地资源不存在 ${link}`)}
}
if(failures.length){console.error('Life OS 校验失败：\n'+failures.map(m=>'  - '+m).join('\n'));process.exit(1)}
console.log(JSON.stringify({result:'passed',modules:manifest.modules.length,independentPages:manifest.modules.filter(m=>m.type==='page').length,files:all.length,checkedLocalReferences:references,totalBytes:all.reduce((n,f)=>n+fs.statSync(f).size,0)},null,2));
