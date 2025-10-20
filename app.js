// Loop — Four-Panel Console
// Behaviour:
// - After Send as A/B: POST /api/send_message, then POST /api/bot/process?dry_run=true to compute preview,
//   then update single preview panels (Bot→A/B). If no preview content is returned, show "No preview available."
// - On Refresh A/B feed: first POST /api/bot/process?dry_run=false (publish), then GET /api/get_messages.
//   If no *new* bot_to_user message since last refresh for that user, show "No new updates since last refresh at HH:MM:SS".

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
  const fmtTime = (d) => d.toLocaleTimeString([], { hour12:false });

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

  const botToAPreview = $('botToAPreview');
  const botToBPreview = $('botToBPreview');

  // ---------- State for "no new updates" comparison
  const lastState = {
    A: { lastBotMsgId: null, lastRefresh: null },
    B: { lastBotMsgId: null, lastRefresh: null },
  };

  // ---------- Storage
  const STORAGE_KEY = 'loop_four_panel_cfg_v3';
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
    assert(/^https?:\/\//.test(b), 'API base must be http(s) URL');
    return b;
  }
  async function apiGet(path, headers = {}) {
    const u = baseUrl() + path;
    const res = await fetch(u, { headers: { 'Accept': 'application/json', ...headers }});
    if (!res.ok) {
      const text = await res.text().catch(()=> '');
      const err = new Error(`HTTP ${res.status} ${res.statusText}`);
      err.response = text;
      throw err;
    }
    return res.json().catch(()=> ({}));
  }
  async function apiPost(path, body, headers = {}) {
    const u = baseUrl() + path;
    const res = await fetch(u, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) {
      const text = await res.text().catch(()=> '');
      const err = new Error(`HTTP ${res.status} ${res.statusText}`);
      err.response = text;
      throw err;
    }
    return res.json().catch(()=> ({}));
  }

  // ---------- Renderers
  function renderFeed(container, items) {
    const arr = Array.isArray(items) ? items : [];
    const rows = arr
      .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
      .map(m => {
        const ts = new Date(m.created_at).toLocaleString();
        const meta = `aud:${m.audience}  by:${(m.created_by||'').slice(0,8)}  to:${(m.recipient_profile_id||'').slice(0,8)}  id:${(m.id||'').slice(0,8)}  @${ts}`;
        return `<div class="item"><div class="meta">${escapeHtml(meta)}</div>${escapeHtml(m.content || '')}</div>`;
      })
      .join('\n');
    container.innerHTML = rows || '<span class="muted">No messages.</span>';
  }

  function renderSinglePreview(container, text) {
    if (!text) {
      container.innerHTML = '<span class="muted">No preview available.</span>';
      return;
    }
    container.textContent = text;
  }

  function showNoNewUpdates(container, lastAt) {
    const ts = lastAt ? fmtTime(lastAt) : fmtTime(new Date());
    container.innerHTML = `<span class="muted">No new updates since last refresh at ${ts}.</span>`;
  }

  // ---------- Preview extraction (supports future server shapes)
  // Expect: items[].previews = [{ recipient_profile_id, content }]
  function extractPreviews(res) {
    const previews = {};
    const items = res?.items ?? [];
    for (const it of items) {
      const list = it.previews || it.proposed || it.bot_to_user_preview || [];
      if (Array.isArray(list)) {
        for (const p of list) {
          const rid = p?.recipient_profile_id || p?.recipient || p?.to;
          const text = p?.content || p?.text;
          if (rid && text) previews[rid] = text; // latest wins
        }
      }
    }
    return previews;
  }

  // ---------- API composites
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

  // Compute previews (dry-run) and update preview panels
  async function refreshPreviews() {
    const tId = threadId.value.trim();
    const op = operatorId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(op, 'Bot operator (X-User-Id) required.');
    setStatus('previewing…');
    try {
      const res = await apiPost(
        `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=10&dry_run=true`,
        {},
        { 'X-User-Id': op }
      );
      log('🤖 preview /api/bot/process (dry_run=true) →', { stats: res?.stats, items: (res?.items||[]).length });
      const previews = extractPreviews(res);
      renderSinglePreview(botToAPreview, previews[userAId.value.trim()] || '');
      renderSinglePreview(botToBPreview, previews[userBId.value.trim()] || '');
    } catch (e) {
      log('❌ preview error:', e.message, e.response || '');
    } finally {
      setStatus('idle');
    }
  }

  // Publish latest bot messages, fetch inbox for a recipient, update "no new updates" UX
  async function publishThenFetchFor(userKey /* 'A'|'B' */) {
    const tId = threadId.value.trim();
    const op = operatorId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(op, 'Bot operator (X-User-Id) required.');
    const recipient = (userKey === 'A') ? userAId.value.trim() : userBId.value.trim();
    const container = (userKey === 'A') ? messagesA : messagesB;

    setStatus('publishing…');
    try {
      await apiPost(
        `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=10&dry_run=false`,
        {},
        { 'X-User-Id': op }
      );
      log('✅ published latest bot messages.');
    } catch (e) {
      log('❌ publish error:', e.message, e.response || '');
    } finally {
      setStatus('idle');
    }

    // Fetch and render
    let items = [];
    try {
      const res = await apiGet(`/api/get_messages?thread_id=${encodeURIComponent(tId)}&user_id=${encodeURIComponent(recipient)}`);
      items = Array.isArray(res?.items) ? res.items : [];
      log('📥 /api/get_messages →', `user:${recipient.slice(0,8)} count:${items.length}`);
    } catch (e) {
      log('❌ fetch inbox error:', e.message, e.response || '');
    }

    // Determine newest bot_to_user for this recipient
    const botItems = items
      .filter(m => m.audience === 'bot_to_user' && m.recipient_profile_id === recipient)
      .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

    const newest = botItems[0] || null;
    const state = lastState[userKey];
    const prevId = state.lastBotMsgId;

    // Update last refresh time
    state.lastRefresh = new Date();

    if (!newest || newest.id === prevId) {
      showNoNewUpdates(container, state.lastRefresh);
    } else {
      state.lastBotMsgId = newest.id;
      renderFeed(container, items);
    }
  }

  // ---------- Wire
  function bind() {
    $('saveCfgBtn').addEventListener('click', saveCfg);
    $('clearCfgBtn').addEventListener('click', clearCfg);

    $('sendABtn').addEventListener('click', async () => {
      try {
        const text = userAText.value.trim();
        await sendAs(userAId.value.trim(), text);
        userAText.value = '';
        // Immediately compute + show previews
        await refreshPreviews();
      } catch (e) { log('❌ send A error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('sendBBtn').addEventListener('click', async () => {
      try {
        const text = userBText.value.trim();
        await sendAs(userBId.value.trim(), text);
        userBText.value = '';
        await refreshPreviews();
      } catch (e) { log('❌ send B error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('refreshABtn').addEventListener('click', async () => {
      try { await publishThenFetchFor('A'); }
      catch (e) { log('❌ refresh A feed error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('refreshBBtn').addEventListener('click', async () => {
      try { await publishThenFetchFor('B'); }
      catch (e) { log('❌ refresh B feed error:', e.message, e.response || ''); setStatus('error'); }
    });

    // --- Maintenance Tools (frontend-only clears; optional elements) ---
    const btnClearA = $('clearA');
    const btnClearB = $('clearB');
    const btnClearBot = $('clearBot');

    btnClearA && btnClearA.addEventListener('click', () => {
      if (messagesA) messagesA.innerHTML = '<span class="muted">Chat cleared.</span>';
      log('🧹 Cleared chat for A.');
    });

    btnClearB && btnClearB.addEventListener('click', () => {
      if (messagesB) messagesB.innerHTML = '<span class="muted">Chat cleared.</span>';
      log('🧹 Cleared chat for B.');
    });

    btnClearBot && btnClearBot.addEventListener('click', () => {
      if (botToAPreview) botToAPreview.innerHTML = '<span class="muted">Cleared.</span>';
      if (botToBPreview) botToBPreview.innerHTML = '<span class="muted">Cleared.</span>';
      log('🧹 Cleared bot previews.');
    });
  }

  // ---------- Init
  async function init() {
    loadCfg();
    bind();

    // Initial fetch for both users (no publish)
    try {
      const [aRes, bRes] = await Promise.all([
        apiGet(`/api/get_messages?thread_id=${encodeURIComponent(threadId.value.trim())}&user_id=${encodeURIComponent(userAId.value.trim())}`),
        apiGet(`/api/get_messages?thread_id=${encodeURIComponent(threadId.value.trim())}&user_id=${encodeURIComponent(userBId.value.trim())}`),
      ]);
      const aItems = Array.isArray(aRes?.items) ? aRes.items : [];
      const bItems = Array.isArray(bRes?.items) ? bRes.items : [];
      renderFeed(messagesA, aItems);
      renderFeed(messagesB, bItems);

      // Initialize last seen bot message ids
      const latestBotA = aItems.filter(m => m.audience==='bot_to_user' && m.recipient_profile_id === userAId.value.trim())
                               .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))[0];
      const latestBotB = bItems.filter(m => m.audience==='bot_to_user' && m.recipient_profile_id === userBId.value.trim())
                               .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))[0];
      lastState.A.lastBotMsgId = latestBotA?.id || null;
      lastState.B.lastBotMsgId = latestBotB?.id || null;

      // Try an initial preview once
      await refreshPreviews();
    } catch (e) {
      log('❌ initial load error:', e.message, e.response || '');
    }

    setStatus('idle');
    log('🟢 Ready. Send as A/B → previews update immediately. Refresh A/B feed → publish then fetch.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();