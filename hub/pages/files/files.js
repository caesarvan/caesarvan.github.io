(() => {
  'use strict';
  const profiles = {
    icloud: ['iCloud 资料导航', '从本机载入 iCloud 文件索引，让资料随时可查。'],
    onedrive: ['OneDrive 资料导航', '统一浏览本地 OneDrive 资料入口，按需打开文件。'],
    outlook: ['Outlook 邮件导航', '载入本机邮件归档索引，快速寻找邮件与附件。'],
    mail: ['邮件归档导航', '把邮件归档入口集中起来，内容保留在你的设备。'],
    youtube: ['YouTube 书签', '载入你的 HTML 书签，搜索感兴趣的视频与频道。']
  };
  const $ = (id) => document.getElementById(id);
  const selectedProfile = profiles[new URLSearchParams(location.search).get('kind')] || ['本地资料导航', '把资料入口放在一起，需要时再从本机载入。'];
  $('page-title').textContent = selectedProfile[0];
  $('page-description').textContent = selectedProfile[1];
  document.title = `${selectedProfile[0]} · Life OS`;
  const state = { entries: [], files: [], directories: [], filter: 'all', indexName: '', rejected: 0, objectURLs: new Set(), loadVersion: 0 };
  const cleanText = (s, max = 500) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const fold = (s) => String(s).normalize('NFC').toLocaleLowerCase();
  const escapeMarkup = (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function notify(message, error = false) { $('import-status').textContent = message; $('import-status').classList.toggle('error', error); }

  // Keep only reconstructed anchors and headings before DOMParser sees the input.
  // No imported element can contain src/srcset/style/events or trigger a resource request.
  function inertLinkDocument(source) {
    const token = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z][a-z0-9:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
    let output = '', offset = 0, blocked = '';
    const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'template', 'noscript', 'svg', 'math', 'textarea', 'title']);
    for (const match of source.matchAll(token)) {
      if (!blocked) output += escapeMarkup(source.slice(offset, match.index));
      const raw = match[0], name = (match[1] || '').toLowerCase(), closing = /^<\//.test(raw);
      if (blocked) { if (closing && name === blocked) blocked = ''; }
      else if (blockedTags.has(name) && !closing) blocked = name;
      else if (name === 'a') {
        if (closing) output += '</a>';
        else {
          const attr = [...raw.slice(2, -1).matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)].find(item => item[1].toLowerCase() === 'href');
          if (attr) {
            const value = attr[2] ?? attr[3] ?? attr[4] ?? '';
            output += `<a href="${escapeMarkup(value).replace(/"/g, '&quot;')}">`;
          } else output += '<a>';
        }
      } else if (/^h[1-6]$/.test(name)) output += `<${closing ? '/' : ''}${name}>`;
      else output += '\n';
      offset = match.index + raw.length;
    }
    if (!blocked) output += escapeMarkup(source.slice(offset));
    return new DOMParser().parseFromString(output, 'text/html');
  }

  function safePath(raw) {
    let value = raw.trim();
    if (!value || /[\u0000-\u001f\u007f]/.test(value) || value.startsWith('//')) return null;
    let isFileURL = /^file:/i.test(value);
    if (isFileURL) {
      try { const url = new URL(value); if (url.hostname && url.hostname !== 'localhost') return null; value = url.pathname; }
      catch { return null; }
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
    const directory = /[\\/]$/.test(value.split(/[?#]/)[0]);
    value = value.split(/[?#]/)[0];
    try { value = decodeURIComponent(value); } catch { return null; }
    if (/[\u0000-\u001f\u007f]/.test(value)) return null;
    const segments = [];
    for (const part of value.replace(/\\/g, '/').normalize('NFC').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!segments.length) return null; segments.pop(); }
      else segments.push(part);
    }
    if (!segments.length) return null;
    return { path: segments.join('/'), directory, absolute: isFileURL || /^[\\/]/.test(value) };
  }

  function classify(raw) {
    const value = raw.trim();
    if (/^https:/i.test(value)) {
      try { const url = new URL(value); if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null; return { type: 'external', href: url.href, path: url.hostname + url.pathname }; }
      catch { return null; }
    }
    if (value.startsWith('#')) return null;
    const local = safePath(value);
    return local ? { type: 'local', ...local } : null;
  }

  function parseIndex(text) {
    const doc = inertLinkDocument(text), entries = [], seen = new Set();
    let rejected = 0, heading = '';
    for (const node of doc.querySelectorAll('h1,h2,h3,h4,h5,h6,a[href]')) {
      if (node.tagName !== 'A') { heading = cleanText(node.textContent, 100); continue; }
      const link = classify(node.getAttribute('href') || '');
      if (!link) { rejected++; continue; }
      const key = `${link.type}:${link.href || link.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ ...link, label: cleanText(node.textContent) || link.path.split('/').pop() || '未命名链接', group: heading });
      if (entries.length >= 30000) break;
    }
    return { entries, rejected };
  }

  function pathScore(target, candidate) {
    const a = fold(target), b = fold(candidate);
    if (a === b) return 30000 + b.length;
    if (a.endsWith('/' + b)) return 20000 + b.length;
    if (b.endsWith('/' + a)) return 10000 + a.length;
    if (a.split('/').pop() === b.split('/').pop()) return 1;
    return 0;
  }
  function bestMatch(target, candidates) {
    let score = 0, winners = [];
    for (const candidate of candidates) {
      const current = pathScore(target, candidate.path);
      if (current > score) { score = current; winners = [candidate]; }
      else if (current && current === score) winners.push(candidate);
    }
    return { value: winners.length === 1 ? winners[0] : null, ambiguous: winners.length > 1 };
  }
  function resolve(entry) {
    if (!state.files.length) return { status: '需选择本地文件夹' };
    if (!entry.directory) {
      const match = bestMatch(entry.path, state.files);
      if (match.value) return { file: match.value.file, path: match.value.path };
      if (match.ambiguous) return { status: '存在同名文件，请选择更精确的文件夹' };
    }
    const directory = bestMatch(entry.path, state.directories);
    if (directory.value) return { directory: directory.value };
    return { status: directory.ambiguous ? '存在同名目录，请选择更精确的文件夹' : '未在已选文件夹中找到' };
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function openLocal(file) {
    // Active document types are opened as plain text; nothing imported is executed.
    const ext = file.name.split('.').pop().toLowerCase();
    const types = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', txt: 'text/plain', md: 'text/plain', csv: 'text/plain', json: 'text/plain', html: 'text/plain', htm: 'text/plain', svg: 'text/plain', xml: 'text/plain', js: 'text/plain', css: 'text/plain', xhtml: 'text/plain', eml: 'text/plain' };
    const blob = new Blob([file], { type: types[ext] || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    state.objectURLs.add(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  function showDirectory(directory) {
    $('directory-title').textContent = directory.path;
    const files = state.files.filter(item => item.path.startsWith(directory.path + '/'));
    $('directory-count').textContent = `此目录包含 ${files.length.toLocaleString('zh-CN')} 个文件；仅展示已选择文件夹中的内容。`;
    $('directory-files').replaceChildren();
    for (const item of files.slice(0, 1000)) {
      const row = element('div', 'directory-file');
      row.append(element('span', '', item.path.slice(directory.path.length + 1)));
      const button = element('button', 'button secondary', '打开文件'); button.type = 'button'; button.addEventListener('click', () => openLocal(item.file)); row.append(button);
      $('directory-files').append(row);
    }
    if (files.length > 1000) $('directory-files').append(element('p', 'truncation-note', '仅展示前 1,000 个文件。选择更小的文件夹可缩小范围。'));
    $('directory-dialog').showModal();
  }
  function render() {
    $('total-count').textContent = state.entries.length.toLocaleString('zh-CN');
    $('external-count').textContent = state.entries.filter(x => x.type === 'external').length.toLocaleString('zh-CN');
    $('file-count').textContent = state.files.length.toLocaleString('zh-CN');
    $('index-name').textContent = state.indexName || '等待选择索引';
    $('folder-name').textContent = state.files.length ? state.files[0].path.split('/')[0] : '尚未选择本地文件夹';
    $('clear-button').disabled = !state.indexName && !state.files.length;
    const query = fold($('search-input').value.trim());
    const results = state.entries.filter(entry => (state.filter === 'all' || entry.type === state.filter) && (!query || fold(`${entry.label} ${entry.path} ${entry.group}`).includes(query)));
    $('result-count').textContent = `${results.length.toLocaleString('zh-CN')} 条记录`;
    $('results').replaceChildren();
    $('empty-state').hidden = results.length > 0;
    if (!results.length) {
      $('empty-state').querySelector('h3').textContent = state.indexName ? '没有找到匹配的记录' : '你的资料，按需载入';
      $('empty-state').querySelector('p').textContent = state.indexName ? '试试其他关键词或筛选条件。索引仅接受 HTTPS 和有效本地路径。' : '公开页面默认不包含私人记录。选择一个 HTML 索引，即可在这里搜索和浏览。';
    }
    for (const entry of results.slice(0, 500)) {
      const record = element('article', `record ${entry.type}`), body = element('div', 'record-body');
      record.append(element('div', 'record-icon', entry.type === 'external' ? '↗' : entry.directory ? '▱' : '▤'));
      body.append(element('h3', '', entry.label));
      const path = element('p', 'record-path', entry.path); path.title = entry.path; body.append(path);
      if (entry.group) body.append(element('span', 'record-status', entry.group));
      if (entry.type === 'external') {
        const link = element('a', 'record-action', '打开网站 ↗'); link.href = entry.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; body.append(link);
      } else {
        const resolved = resolve(entry), button = element('button', 'record-action', resolved.file ? '打开本地文件 ↗' : resolved.directory ? '查看目录 →' : resolved.status);
        button.type = 'button'; button.disabled = !resolved.file && !resolved.directory;
        if (resolved.file) button.addEventListener('click', () => openLocal(resolved.file));
        else if (resolved.directory) button.addEventListener('click', () => showDirectory(resolved.directory));
        body.append(button);
      }
      record.append(body); $('results').append(record);
    }
    if (results.length > 500) $('results').append(element('p', 'truncation-note', '当前展示前 500 条，请搜索关键词缩小范围。'));
  }
  $('index-input').addEventListener('change', async (event) => {
    const file = event.target.files[0], version = ++state.loadVersion;
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { notify('索引超过 20 MB，请选择更小的 HTML 文件。', true); event.target.value = ''; return; }
    try {
      const text = await file.text(); if (version !== state.loadVersion) return;
      const parsed = parseIndex(text);
      state.entries = parsed.entries; state.rejected = parsed.rejected; state.indexName = file.name;
      notify(`已从 ${file.name} 载入 ${parsed.entries.length.toLocaleString('zh-CN')} 条链接${parsed.rejected ? `，忽略 ${parsed.rejected} 条不支持或无效链接` : ''}。本地链接需选择对应文件夹。`);
      render();
    } catch { notify('无法读取此索引，请确认它是可读取的 HTML 文件。', true); }
    event.target.value = '';
  });
  $('folder-input').addEventListener('change', (event) => {
    const chosen = Array.from(event.target.files);
    if (!chosen.length) return;
    state.files = chosen.map(file => ({ file, path: (file.webkitRelativePath || file.name).normalize('NFC') }));
    const directories = new Set();
    for (const item of state.files) { const parts = item.path.split('/'); for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/')); }
    state.directories = [...directories].map(path => ({ path }));
    notify(`已在内存中关联 ${chosen.length.toLocaleString('zh-CN')} 个本地文件；未上传文件内容。`); render(); event.target.value = '';
  });
  $('clear-button').addEventListener('click', () => {
    state.loadVersion++; for (const url of state.objectURLs) URL.revokeObjectURL(url); state.objectURLs.clear();
    state.entries = []; state.files = []; state.directories = []; state.indexName = ''; state.rejected = 0;
    $('index-input').value = ''; $('folder-input').value = ''; $('search-input').value = '';
    $('directory-files').replaceChildren(); if ($('directory-dialog').open) $('directory-dialog').close();
    notify('已清除本页载入的索引、文件引用与临时链接。'); render();
  });
  $('search-input').addEventListener('input', render);
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); }); render();
  }));
  $('close-directory').addEventListener('click', () => $('directory-dialog').close());
  window.addEventListener('pagehide', () => { for (const url of state.objectURLs) URL.revokeObjectURL(url); });
  render();
})();
