// Loop — Four-Panel Console
(function () {
  // ---------- DOM helpers
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const logEl = $('console');

  function setStatus(t) { statusEl.textContent = t; }
  function log(...args) {
    const line = args.map(a => {
      try { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); }
      catch { return String(a); }
    }).join(' ');
    logEl.textContent += `\n${line}`;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function escapeHtml(s) {
    return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  }

  // ---------- Elements
  const apiBase = $('apiBase');
  const threadId = $('threadId');
  const operatorId = $('operatorId');

  const userAId = $('userAId');
  const userAText = $('userAText');
  const messagesA = $('messagesA');

  const userBId = $('userBId');
  const userBText = $('userBText');
  const messagesB = $('messagesB');

  const botToA = $('botToA');
  const botToB = $('botToB');

  // ---------- Storage
  const STORAGE_KEY = 'loop_four_panel_cfg_v1';
  function saveCfg() {
    const cfg = {
      apiBase: apiBase.value.trim(),
      threadId: threadId.value.trim(),
      operatorId: operatorId.value.trim(),
      userAId: userAId.value.trim(),
      userBId: userBId.value.trim(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    log('✅ Saved config.');
  }
  function loadCfg() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const cfg = JSON.parse(raw);
      if (cfg.apiBase) apiBase.value = cfg.apiBase;
      if (cfg.threadId) threadId.value = cfg.threadId;
      if (cfg.operatorId) operatorId.value = cfg.operatorId;
      if (cfg.userAId) userAId.value = cfg.userAId;
      if (cfg.userBId) userBId.value = cfg.userBId;
      log('ℹ️ Loaded saved config.');
    } catch {}
  }
  function clearCfg() {
    localStorage.removeItem(STORAGE_KEY);
    log('🧹 Cleared saved config.');
  }

  // ---------- HTTP helpers
  function assert(v, msg) { if (!v) throw new Error(msg); }
  function baseUrl() {
    const b = apiBase.value.trim().replace(/\/+$/, '');
    assert(/^https?:\/\//.test(b), 'API Base must be http(s) URL.');
    return b;
  }
  async function apiPost(path, body, headers = {}) {
    const url = `${baseUrl()}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body ?? {})
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    if (!res.ok) { const e = new Error(`HTTP ${res.status} ${res.statusText}`); e.response = json; throw e; }
    return json;
  }
  async function apiGet(path) {
    const url = `${baseUrl()}${path}`;
    const res = await fetch(url, { method: 'GET' });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    if (!res.ok) { const e = new Error(`HTTP ${res.status} ${res.statusText}`); e.response = json; throw e; }
    return json;
  }

  // ---------- UI renderers
  function renderMessages(container, items, filterFn = null) {
    const arr = Array.isArray(items) ? items : [];
    const rows = arr
      .filter(m => filterFn ? filterFn(m) : true)
      .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
      .map(m => {
        const ts = new Date(m.created_at).toLocaleString();
        const meta = `aud:${m.audience}  by:${(m.created_by||'').slice(0,8)}  to:${(m.recipient_profile_id||'').slice(0,8)}  id:${(m.id||'').slice(0,8)}`;
        return `<div class="msg">
          <div class="small muted">${ts}</div>
          <div style="margin:6px 0 8px 0;">${escapeHtml(m.content ?? '')}</div>
          <div class="small">${meta}</div>
        </div>`;
      }).join('');
    container.innerHTML = rows || `<div class="small muted">No messages.</div>`;
  }

  // ---------- Actions
  async function sendAs(userId, text) {
    const tId = threadId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(userId, 'User ID required.');
    assert(text, 'Message text required.');
    setStatus('sending…');
    const res = await apiPost('/api/send_message', {
      thread_id: tId, user_id: userId, content: text
    });
    log('📨 /api/send_message →', res);
    setStatus('idle');
    return res;
  }

  async function runProcess(dryRun) {
    const tId = threadId.value.trim();
    const op = operatorId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(op, 'Bot operator (X-User-Id) required.');
    setStatus(dryRun ? 'previewing…' : 'processing…');
    const path = `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=10&dry_run=${dryRun}`;
    const res = await apiPost(path, {}, { 'X-User-Id': op });
    log(`🤖 /api/bot/process (dry_run=${dryRun}) →`, res);
    setStatus('idle');
    return res;
  }

  async function fetchInboxFor(userId) {
    const tId = threadId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(userId, 'Recipient user id required.');
    setStatus('fetching…');
    const res = await apiGet(`/api/get_messages?thread_id=${encodeURIComponent(tId)}&user_id=${encodeURIComponent(userId)}`);
    log('📥 /api/get_messages →', `user:${userId.slice(0,8)} count:${res?.items?.length ?? 0}`);
    setStatus('idle');
    return Array.isArray(res?.items) ? res.items : [];
  }

  // For Bot → A/B “current” displays:
  // We interpret “current” as “most recent bot_to_user message to that recipient”.
  async function refreshBotTo(container, userId) {
    const items = await fetchInboxFor(userId);
    const onlyBotToUser = items.filter(m => m.audience === 'bot_to_user' && m.recipient_profile_id === userId);
    renderMessages(container, onlyBotToUser);
  }

  async function refreshUserView(container, userId) {
    const items = await fetchInboxFor(userId);
    // Show all messages visible to that user (human + bot) as their “chat view”
    renderMessages(container, items);
  }

  // ---------- Wire
  function bind() {
    $('saveCfgBtn').addEventListener('click', saveCfg);
    $('clearCfgBtn').addEventListener('click', clearCfg);

    $('sendABtn').addEventListener('click', async () => {
      try {
        const text = userAText.value.trim();
        await sendAs(userAId.value.trim(), text);
        await runProcess(false);              // actually generate bot messages
        await refreshUserView(messagesA, userAId.value.trim());
        await refreshBotTo(botToA, userAId.value.trim());
        await refreshBotTo(botToB, userBId.value.trim());
        userAText.value = '';
      } catch (e) { log('❌ send A error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('sendBBtn').addEventListener('click', async () => {
      try {
        const text = userBText.value.trim();
        await sendAs(userBId.value.trim(), text);
        await runProcess(false);
        await refreshUserView(messagesB, userBId.value.trim());
        await refreshBotTo(botToA, userAId.value.trim());
        await refreshBotTo(botToB, userBId.value.trim());
        userBText.value = '';
      } catch (e) { log('❌ send B error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('refreshABtn').addEventListener('click', async () => {
      try { await refreshUserView(messagesA, userAId.value.trim()); } 
      catch (e) { log('❌ refresh A error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('refreshBBtn').addEventListener('click', async () => {
      try { await refreshUserView(messagesB, userBId.value.trim()); } 
      catch (e) { log('❌ refresh B error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('fetchBotA').addEventListener('click', async () => {
      try { await refreshBotTo(botToA, userAId.value.trim()); } 
      catch (e) { log('❌ bot→A error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('fetchBotB').addEventListener('click', async () => {
      try { await refreshBotTo(botToB, userBId.value.trim()); } 
      catch (e) { log('❌ bot→B error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('processBtn').addEventListener('click', async () => {
      try {
        await runProcess(false);
        await refreshBotTo(botToA, userAId.value.trim());
        await refreshBotTo(botToB, userBId.value.trim());
      } catch (e) { log('❌ process error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('previewBtn').addEventListener('click', async () => {
      try {
        const res = await runProcess(true);
        // If API returns preview content, render here. Otherwise, let user know:
        if (!res || !res.items || !res.items.length) {
          botToA.innerHTML = `<div class="small muted">No preview text received from API (dry run). Use “Send (process)” to view actual bot messages.</div>`;
          botToB.innerHTML = `<div class="small muted">No preview text received from API (dry run). Use “Send (process)” to view actual bot messages.</div>`;
        }
      } catch (e) { log('❌ preview error:', e.message, e.response || ''); setStatus('error'); }
    });
  }

  // ---------- Init
  function init() {
    loadCfg();
    bind();
    // Initial load of panels
    Promise.all([
      refreshUserView(messagesA, userAId.value.trim()),
      refreshUserView(messagesB, userBId.value.trim()),
      refreshBotTo(botToA, userAId.value.trim()),
      refreshBotTo(botToB, userBId.value.trim())
    ]).catch(()=>{});
    setStatus('idle');
    log('🟢 Ready. Type in A or B, click Send. The console will process and update bot panels.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();