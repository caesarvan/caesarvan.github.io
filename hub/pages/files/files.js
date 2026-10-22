(() => {
  'use strict';
  const profiles = {
    icloud: ['iCloud 资料导航', '搜索完整资料索引，了解文件位置与分类。'],
    onedrive: ['OneDrive 资料导航', '集中浏览 OneDrive 资料索引与分类。'],
    outlook: ['Outlook 邮件导航', '按附件名称与邮件主题查找记录，返回来源邮件。'],
    mail: ['邮件归档导航', '查看早期邮件归档索引与邮件来源。'],
    youtube: ['YouTube 书签', '搜索已整理的视频与频道，打开喜欢的内容。']
  };
  const $ = id => document.getElementById(id);
  const requested = new URLSearchParams(location.search).get('kind');
  const kind = Object.hasOwn(profiles, requested) ? requested : 'icloud';
  const profile = profiles[kind];
  const PAGE_SIZE = 100;
  const state = { entries: [], filter: 'all', page: 0, status: 'loading', reason: '', generatedAt: '', controller: null };
  $('page-title').textContent = profile[0];
  $('page-description').textContent = profile[1];
  document.title = `${profile[0]} · Life OS`;
  const fold = value => String(value).normalize('NFC').toLocaleLowerCase();
  const isText = (value, max = 5000) => typeof value === 'string' && value.length <= max;
  const sensitiveKey = /(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|signature|credential|authorization|session|securitytoken|^sig$|^code$|^ticket$|^key$|^sid$|^jwt$|^x-amz-|^x-goog-)/i;

  function safeHref(value) {
    if (!isText(value)) throw new Error('索引中的链接格式不正确。');
    let url;
    try { url = new URL(value); } catch { throw new Error('索引包含无效链接。'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || [...url.searchParams.keys()].some(key => sensitiveKey.test(key))) throw new Error('索引包含不支持的链接。');
    return url.href;
  }
  function validate(data) {
    if (!data || data.version !== 1 || data.kind !== kind || !['ready', 'unavailable'].includes(data.status) || !Array.isArray(data.entries) || data.entries.length > 100000) throw new Error('索引格式不正确，请稍后重试。');
    if (data.status === 'unavailable') {
      if (!isText(data.reason, 1000) || data.entries.length) throw new Error('索引的来源状态不正确。');
      return data;
    }
    for (const entry of data.entries) {
      if (!entry || !['local', 'external'].includes(entry.type) || !isText(entry.label, 2000) || !entry.label || !isText(entry.path) || !isText(entry.group, 1000) || (entry.description !== undefined && !isText(entry.description, 3000))) throw new Error('索引记录格式不正确。');
      if (entry.type === 'external') safeHref(entry.href);
      if (entry.sourceHref !== undefined) safeHref(entry.sourceHref);
    }
    return data;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function notify(message, error = false) {
    $('load-status').textContent = message;
    $('load-status').classList.toggle('error', error);
  }
  function externalLink(href, title) {
    const link = element('a', 'record-action', title);
    link.href = safeHref(href); link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  }
  function render() {
    const loading = state.status === 'loading';
    $('source-panel').setAttribute('aria-busy', String(loading));
    $('reload-button').disabled = loading;
    $('reload-button').textContent = loading ? '正在载入…' : '重新加载';
    $('total-count').textContent = state.entries.length.toLocaleString('zh-CN');
    $('external-count').textContent = state.entries.filter(entry => entry.type === 'external' || entry.sourceHref).length.toLocaleString('zh-CN');
    $('file-count').textContent = state.entries.filter(entry => entry.type === 'local').length.toLocaleString('zh-CN');
    const generated = Date.parse(state.generatedAt);
    $('index-name').textContent = Number.isFinite(generated) ? `更新于 ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(generated)}` : loading ? '正在载入索引' : '尚无可用索引';
    const query = fold($('search-input').value.trim());
    const results = state.entries.filter(entry => (state.filter === 'all' || (state.filter === 'local' ? entry.type === 'local' : entry.type === 'external' || entry.sourceHref)) && (!query || fold(`${entry.label} ${entry.path} ${entry.group} ${entry.description || ''}`).includes(query)));
    const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages - 1);
    $('result-count').textContent = `${results.length.toLocaleString('zh-CN')} 条记录`;
    $('results').replaceChildren();
    $('empty-state').hidden = results.length > 0;
    if (!results.length) {
      $('empty-heading').textContent = state.status === 'loading' ? '正在载入资料索引' : state.status === 'unavailable' ? '来源索引暂不可用' : state.status === 'error' ? '索引载入失败' : '没有找到匹配的记录';
      $('empty-description').textContent = state.status === 'loading' ? '页面正在读取已发布的索引，请稍候。' : state.reason || '试试其他关键词或筛选条件。';
    }
    for (const entry of results.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE)) {
      const record = element('article', `record ${entry.type}`), body = element('div', 'record-body');
      record.append(element('div', 'record-icon', entry.type === 'external' ? '↗' : entry.directory ? '▱' : '▤'));
      body.append(element('h3', '', entry.label));
      if (entry.description) body.append(element('p', 'record-description', entry.description));
      const path = element('p', 'record-path', entry.path); path.title = entry.path; body.append(path);
      if (entry.group) body.append(element('span', 'record-status', entry.group));
      if (entry.type === 'external') body.append(externalLink(entry.href, '打开网站 ↗'));
      else body.append(element('span', 'record-notice', '附件未发布'));
      if (entry.sourceHref) body.append(externalLink(entry.sourceHref, '打开来源邮件 ↗'));
      record.append(body); $('results').append(record);
    }
    $('pagination').hidden = results.length <= PAGE_SIZE;
    $('previous-button').disabled = state.page === 0;
    $('next-button').disabled = state.page >= pages - 1;
    $('page-count').textContent = results.length ? `${state.page * PAGE_SIZE + 1}–${Math.min((state.page + 1) * PAGE_SIZE, results.length)} / ${results.length.toLocaleString('zh-CN')}` : '0';
  }
  async function load() {
    state.controller?.abort();
    const controller = new AbortController(); state.controller = controller;
    state.status = 'loading'; state.reason = '';
    notify('正在读取已发布的资料索引…'); render();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`../../data/${kind}.json`, { signal: controller.signal, cache: 'no-cache', credentials: 'omit' });
      if (!response.ok) throw new Error(`暂时无法读取索引（HTTP ${response.status}），请点击重新加载。`);
      const data = validate(await response.json());
      if (state.controller !== controller) return;
      state.entries = data.entries; state.status = data.status;
      state.reason = data.status === 'unavailable' ? data.reason : '';
      state.generatedAt = isText(data.generatedAt, 100) ? data.generatedAt : ''; state.page = 0;
      notify(data.status === 'ready' ? `已自动载入 ${data.entries.length.toLocaleString('zh-CN')} 条索引。附件原文件未发布；外部网站与来源邮件由你点击后打开。` : data.reason, data.status === 'unavailable');
    } catch (failure) {
      if (state.controller !== controller) return;
      state.status = 'error';
      state.reason = failure.name === 'AbortError' ? '索引读取超过 15 秒，请检查网络后重新加载。' : failure instanceof SyntaxError ? '索引数据暂时无法解析，请稍后重新加载。' : failure.message || '索引载入失败，请重新加载。';
      notify(state.reason + (state.entries.length ? ' 当前仍保留上次成功载入的记录。' : ''), true);
    } finally {
      clearTimeout(timeout);
      if (state.controller === controller) render();
    }
  }
  $('reload-button').addEventListener('click', load);
  $('search-input').addEventListener('input', () => { state.page = 0; render(); });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter; state.page = 0;
    document.querySelectorAll('[data-filter]').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); }); render();
  }));
  $('previous-button').addEventListener('click', () => { state.page = Math.max(0, state.page - 1); render(); $('library-title').scrollIntoView({ block: 'start' }); });
  $('next-button').addEventListener('click', () => { state.page++; render(); $('library-title').scrollIntoView({ block: 'start' }); });
  window.addEventListener('pagehide', () => state.controller?.abort());
  load();
})();
