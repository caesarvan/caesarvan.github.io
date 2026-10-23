import {mountOverview} from './overview.js?v=20261023-summary-v2';
const $=s=>document.querySelector(s),main=$('#main');
let registry,filter='all',search='',overview,frameCleanup=()=>{};
const groups={all:'全部领域',life:'生活与财务',files:'资料与收藏',more:'关于我'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enabled=()=>registry.modules.filter(m=>m.enabled).sort((a,b)=>a.order-b.order);
function route(){try{return location.hash.startsWith('#/')?decodeURIComponent(location.hash.slice(2)).split('?')[0]:'home'}catch{return 'home'}}
function nav(){let group='';$('#navigation').innerHTML=`<a href="#/home" class="nav-item ${route()==='home'?'active':''}" ${route()==='home'?'aria-current="page"':''}><span class="nav-icon">▦</span>生活总览</a>`+enabled().map(m=>{const label=m.group!==group?`<div class="nav-section">${esc(groups[m.group]||m.group)}</div>`:'';group=m.group;return`${label}<a href="#/${esc(m.id)}" class="nav-item ${route()===m.id?'active':''}" ${route()===m.id?'aria-current="page"':''}><span class="nav-icon" style="color:${esc(m.color)}">${esc(m.icon)}</span>${esc(m.title)}</a>`}).join('');$('#mobile-current').textContent=route()==='home'?'生活总览':enabled().find(m=>m.id===route())?.title||'导航'}
function grid(){const shown=enabled().filter(m=>(filter==='all'||m.group===filter)&&`${m.title} ${m.description}`.toLowerCase().includes(search.toLowerCase()));$('#spaces').innerHTML=shown.length?shown.map(m=>`<a class="space" href="#/${esc(m.id)}" style="--color:${esc(m.color)}"><span class="space-icon">${esc(m.icon)}</span><div><h2>${esc(m.title)}</h2><p>${esc(m.description)}</p></div><span class="space-arrow">→</span></a>`).join(''):'<div class="empty">没有匹配的领域。</div>';document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter))})}
function syncTheme(frame){try{frame.contentWindow.postMessage({type:'life-hub:theme',theme:document.documentElement.dataset.theme},location.origin)}catch{}}
function attachFrame(frame){
  let timer;
  const fail=()=>{if(!frame.isConnected)return;$('#frame-status').innerHTML='页面尚未完成载入。<button id="frame-retry" type="button">重试</button>，也可独立打开。';$('#frame-status').hidden=false};
  const loaded=()=>{clearTimeout(timer);$('#frame-status').hidden=true;syncTheme(frame)};
  frame.addEventListener('load',loaded);timer=setTimeout(fail,20000);
  const receive=e=>{
    if(e.origin!==location.origin||e.source!==frame.contentWindow||!e.data||typeof e.data!=='object')return;
    if(e.data.type==='life-hub:height'&&Number.isFinite(e.data.height))frame.style.height=`${Math.min(100000,Math.max(500,e.data.height))}px`;
    if(e.data.type==='life-hub:location'&&route()==='profile'&&['index.html','about.html','projects.html','awards.html','contact.html','work.html'].includes(e.data.path)){const url=new URL('./pages/profile/'+e.data.path,location.href);const params=new URLSearchParams({page:e.data.path,lang:e.data.lang==='en'?'en':'zh'});url.searchParams.set('lang',params.get('lang'));if(typeof e.data.hash==='string'&&e.data.hash.startsWith('#')&&e.data.hash.length<500){url.hash=e.data.hash;params.set('section',e.data.hash.slice(1))}$('.module-toolbar .open').href=url.href;history.replaceState(null,'',`#/profile?${params}`)}
    if(e.data.type==='life-hub:navigate'&&(e.data.module==='home'||enabled().some(m=>m.id===e.data.module)))location.hash=`#/${e.data.module}`;
  };
  addEventListener('message',receive);
  frameCleanup=()=>{clearTimeout(timer);removeEventListener('message',receive);frame.removeEventListener('load',loaded)};
}
function render(){
  overview?.destroy();overview=null;frameCleanup();nav();
  document.body.classList.remove('menu-open');$('#menu-toggle').setAttribute('aria-expanded','false');
  const id=route();
  if(id==='home'){
    document.title='Caesar · Life OS';$('#breadcrumb').textContent='我的空间 / 生活总览';main.className='overview-main';
    main.innerHTML=`<section class="welcome"><div><div class="eyebrow">CAESAR'S PERSONAL SPACE</div><h1>生活的每一面，都在这里。</h1><p class="intro">从总览看见变化，沿着数据进入每个领域。</p></div><a class="profile-shortcut" href="#/profile"><span class="avatar">C</span><span><strong>Caesar Fan</strong><small>经历 · 项目 · 关于我 →</small></span></a></section><div id="overview-data" aria-live="polite"></div><details class="directory"><summary>全部领域与入口 <span>${enabled().length} 个领域</span></summary><div class="toolbar"><div class="filters" aria-label="筛选领域">${Object.entries(groups).map(([k,v])=>`<button data-filter="${k}" aria-pressed="${filter===k}">${v}</button>`).join('')}</div><label class="search">⌕ <input type="search" id="space-search" aria-label="搜索领域" placeholder="搜索领域…" value="${esc(search)}"></label></div><div class="grid" id="spaces"></div></details>`;
    overview=mountOverview($('#overview-data'),{modules:enabled()});grid();$('#space-search').addEventListener('input',e=>{search=e.target.value;grid()});return;
  }
  const m=enabled().find(m=>m.id===id);
  if(!m){main.innerHTML='<h1>未找到这个领域</h1><p><a class="open" href="#/home">返回生活总览</a></p>';return}
  document.title=`${m.title} · Life OS`;$('#breadcrumb').textContent=`我的空间 / ${m.title}`;main.className='module-main';
  const direct=new URL(m.href,location.href);if(id==='profile'){const params=new URLSearchParams(location.hash.split('?')[1]||'');const page=params.get('page');if(['index.html','about.html','projects.html','awards.html','contact.html','work.html'].includes(page))direct.pathname=direct.pathname.replace(/[^/]+$/,page);if(params.get('lang')==='en')direct.searchParams.set('lang','en');if(params.get('section'))direct.hash=params.get('section')}const embed=new URL(direct);embed.searchParams.set('embed','1');embed.searchParams.set('theme',document.documentElement.dataset.theme||'light');
  main.innerHTML=`<div class="module-toolbar"><a class="back" href="#/home">← 生活总览</a><h1 class="module-context">${esc(m.title)}</h1>${({finance:['webank','investment'],webank:['finance','investment'],investment:['finance','webank'],travel:['finance']}[id]||[]).map(key=>`<a class="related-link" href="#/${key}">${esc(enabled().find(item=>item.id===key)?.title)} →</a>`).join('')}<a class="open" target="_blank" rel="noopener" href="${esc(direct.href)}">独立打开 ↗</a></div>`+(m.type==='page'?`<div id="frame-status" class="frame-status" role="status">正在载入${esc(m.title)}…</div><div class="frame-wrap"><iframe title="${esc(m.title)}" src="${esc(embed.href)}" sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups"></iframe></div>`:`<section class="external"><h1>${esc(m.title)}</h1><p>${esc(m.externalNote||m.description)}</p><a class="open" href="${esc(direct.href)}" target="_blank" rel="noopener">打开网站 ↗</a></section>`);
  const frame=$('iframe');if(frame)attachFrame(frame);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){filter=b.dataset.filter;grid()}if(e.target.closest('.skip')){e.preventDefault();main.focus();main.scrollIntoView()}if(e.target.closest('#frame-retry')){const frame=$('iframe');frame.src=frame.src}if(e.target.closest('.menu-scrim')){$('#menu-toggle').click()}});
addEventListener('hashchange',()=>{render();scrollTo(0,0)});
$('#menu-toggle').addEventListener('click',()=>{const open=document.body.classList.toggle('menu-open');$('#menu-toggle').setAttribute('aria-expanded',String(open))});
$('#theme').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;$('#theme').setAttribute('aria-label',theme==='dark'?'切换浅色主题':'切换深色主题');try{localStorage.setItem('life-hub-theme',theme)}catch{}const frame=$('iframe');if(frame)syncTheme(frame)});
try{document.documentElement.dataset.theme=localStorage.getItem('life-hub-theme')||'light'}catch{}
try{const r=await fetch('./modules.json');if(!r.ok)throw Error('领域登记表暂时无法读取');registry=await r.json();if(registry.version!==1||!Array.isArray(registry.modules))throw Error('领域登记表格式无效');render()}catch(e){main.innerHTML=`<h1>生活空间暂时无法载入</h1><p>${esc(e.message)}</p><button class="open" onclick="location.reload()">重新载入</button>`}
