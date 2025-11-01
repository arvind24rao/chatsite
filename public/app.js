// Loop — Four-Panel Console (JWT-enabled Option 1)
// Adds per-user (A/B) and operator JWTs to all requests without changing existing UX.
// - Paste tokens in console.html -> Auth & Tokens strip
// - User calls use A/B JWT; bot/process uses Operator JWT (+ keeps X-User-Id)
// - Initial GETs and all actions are now auth-aware

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

  // NEW controls added in console.html
  const processLimitEl = $('processLimit');                  // number input (1..100), default 10
  const previewOnSendEl = $('previewOnSend');                // checkbox, default ON
  const previewAfterPublishEl = $('previewAfterPublish');    // checkbox, default OFF
  const previewNowBtn = $('previewNowBtn');                  // manual preview button

  // NEW preview timestamp labels
  const botAPreviewMeta = $('botAPreviewMeta');
  const botBPreviewMeta = $('botBPreviewMeta');

  // NEW: Auth strip elements (Option 1: paste JWTs)
  const jwtAEl = $('jwtA');
  const jwtBEl = $('jwtB');
  const jwtOpEl = $('jwtOperator');

  // ---------- State for "no new updates" comparison
  const lastState = {
    A: { lastBotMsgId: null, lastRefresh: null, lastPreviewAt: null },
    B: { lastBotMsgId: null, lastRefresh: null, lastPreviewAt: null },
  };

  // ---------- Minimal auth state
  const authState = {
    A: { jwt: null },
    B: { jwt: null },
    operator: { jwt: null },
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
      // persisted settings
      processLimit: Number(processLimitEl?.value || 10),
      previewOnSend: !!(previewOnSendEl?.checked ?? true),
      previewAfterPublish: !!(previewAfterPublishEl?.checked ?? false),
      // persist JWTs locally for convenience (dev only)
      jwtA: jwtAEl?.value?.trim() || '',
      jwtB: jwtBEl?.value?.trim() || '',
      jwtOp: jwtOpEl?.value?.trim() || '',
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

      if (processLimitEl && Number.isFinite(cfg.processLimit)) processLimitEl.value = String(cfg.processLimit);
      if (typeof cfg.previewOnSend === 'boolean' && previewOnSendEl) previewOnSendEl.checked = cfg.previewOnSend;
      if (typeof cfg.previewAfterPublish === 'boolean' && previewAfterPublishEl) previewAfterPublishEl.checked = cfg.previewAfterPublish;

      // load JWTs to fields + state (dev convenience)
      if (jwtAEl) jwtAEl.value = cfg.jwtA || '';
      if (jwtBEl) jwtBEl.value = cfg.jwtB || '';
      if (jwtOpEl) jwtOpEl.value = cfg.jwtOp || '';
      if (cfg.jwtA) authState.A.jwt = cfg.jwtA;
      if (cfg.jwtB) authState.B.jwt = cfg.jwtB;
      if (cfg.jwtOp) authState.operator.jwt = cfg.jwtOp;

      log('ℹ️ Loaded saved config.');
    } catch {}
  }
  function clearCfg() {
    localStorage.removeItem(STORAGE_KEY);
    log('🧹 Cleared saved config.');
  }

  // ---------- Auth helpers
  function assert(v, msg) { if (!v) throw new Error(msg); }
  function baseUrl() {
    const b = apiBase.value.trim().replace(/\/+$/, '');
    assert(/^https?:\/\//.test(b), 'API Base must be http(s) URL.');
    return b;
  }

  function bearer(jwt) {
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  }

  function authHeadersForUserId(userId) {
    // Determine A or B by matching the input values
    const aId = userAId.value.trim();
    const bId = userBId.value.trim();
    if (userId === aId) return bearer(authState.A.jwt);
    if (userId === bId) return bearer(authState.B.jwt);
    // fallback: no token
    return {};
  }

  function operatorHeaders() {
    // Keep X-User-Id for compatibility; add Authorization if provided
    const base = {};
    const op = operatorId.value.trim();
    if (op) base['X-User-Id'] = op;
    const auth = bearer(authState.operator.jwt);
    return { ...base, ...auth };
  }

  // ---------- HTTP helpers (now accept optional headers)
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
  async function apiGet(path, headers = {}) {
    const url = `${baseUrl()}${path}`;
    const res = await fetch(url, { method: 'GET', headers });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    if (!res.ok) { const e = new Error(`HTTP ${res.status} ${res.statusText}`); e.response = json; throw e; }
    return json;
  }

  // ---------- Renderers
  function renderFeed(container, items) {
    const arr = Array.isArray(items) ? items : [];
    const rows = arr
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
    container.innerHTML = rows || `<span class="muted">No messages.</span>`;
  }

  function renderSinglePreview(container, text) {
    container.innerHTML = text
      ? `<div class="msg"><div>${escapeHtml(text)}</div></div>`
      : `<span class="muted">No preview available.</span>`;
  }

  function showNoNewUpdates(container, lastAt) {
    const ts = lastAt ? fmtTime(lastAt) : fmtTime(new Date());
    container.innerHTML = `<span class="muted">No new updates since last refresh at ${ts}.</span>`;
  }

  // ---------- Preview extraction
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

  function clearPreviewFor(userKey) {
    if (userKey === 'A' && botToAPreview) {
      botToAPreview.innerHTML = '<span class="muted">No preview available.</span>';
    }
    if (userKey === 'B' && botToBPreview) {
      botToBPreview.innerHTML = '<span class="muted">No preview available.</span>';
    }
  }

  function setPreviewMeta(userKey, date) {
    const ts = date ? fmtTime(date) : '--:--:--';
    if (userKey === 'A' && botAPreviewMeta) botAPreviewMeta.textContent = `Last preview — ${ts}`;
    if (userKey === 'B' && botBPreviewMeta) botBPreviewMeta.textContent = `Last preview — ${ts}`;
  }

  function getProcessLimit() {
    const n = Number(processLimitEl?.value || 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 10;
  }

  // ---------- API composites (now auth-aware)
  async function sendAs(userId, text) {
    const tId = threadId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(userId, 'User ID required.');
    assert(text, 'Message text required.');

    // Require JWT for the sender
    const headers = authHeadersForUserId(userId);
    if (!headers.Authorization) {
      throw new Error('Missing JWT for this sender. Paste the token above first.');
    }

    setStatus('sending…');
    const res = await apiPost('/api/send_message', {
      thread_id: tId, user_id: userId, content: text
    }, headers);
    log('📨 /api/send_message →', res);
    setStatus('idle');
    return res;
  }

  // Compute previews (dry-run) and update preview panels — uses Operator JWT
  async function refreshPreviews() {
    const tId = threadId.value.trim();
    const op = operatorId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(op, 'Bot operator (X-User-Id) required.');
    const headers = operatorHeaders();
    if (!headers.Authorization) {
      log('⚠️ No Operator JWT set — bot/process may be rejected under strict auth.');
    }

    setStatus('previewing…');
    try {
      const res = await apiPost(
        `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=${getProcessLimit()}&dry_run=true`,
        {},
        headers
      );
      log('🤖 preview /api/bot/process (dry_run=true) →', { stats: res?.stats, items: (res?.items||[]).length });
      const previews = extractPreviews(res);
      renderSinglePreview(botToAPreview, previews[userAId.value.trim()] || '');
      renderSinglePreview(botToBPreview, previews[userBId.value.trim()] || '');

      const now = new Date();
      lastState.A.lastPreviewAt = now;
      lastState.B.lastPreviewAt = now;
      setPreviewMeta('A', now);
      setPreviewMeta('B', now);
    } catch (e) {
      log('❌ preview error:', e.message, e.response || '');
    } finally {
      setStatus('idle');
    }
  }

  // Publish latest bot messages, then fetch inbox for a recipient with that recipient's JWT
  async function publishThenFetchFor(userKey /* 'A'|'B' */) {
    const tId = threadId.value.trim();
    const op = operatorId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(op, 'Bot operator (X-User-Id) required.');

    const recipient = (userKey === 'A') ? userAId.value.trim() : userBId.value.trim();
    const container = (userKey === 'A') ? messagesA : messagesB;

    // Operator-authenticated publish
    const opHeaders = operatorHeaders();
    if (!opHeaders.Authorization) {
      log('⚠️ No Operator JWT set — publish may be rejected under strict auth.');
    }

    setStatus('publishing…');
    try {
      await apiPost(
        `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=${getProcessLimit()}&dry_run=false`,
        {},
        opHeaders
      );
      log('✅ published latest bot messages.');
    } catch (e) {
      log('❌ publish error:', e.message, e.response || '');
    } finally {
      setStatus('idle');
    }

    // Recipient-authenticated fetch
    let items = [];
    try {
      const recHeaders = authHeadersForUserId(recipient);
      if (!recHeaders.Authorization) {
        throw new Error('Missing JWT for this recipient. Paste the token above first.');
      }
      const res = await apiGet(
        `/api/get_messages?thread_id=${encodeURIComponent(tId)}&user_id=${encodeURIComponent(recipient)}`,
        recHeaders
      );
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

    state.lastRefresh = new Date();

    if (!newest || newest.id === prevId) {
      showNoNewUpdates(container, state.lastRefresh);
    } else {
      state.lastBotMsgId = newest.id;
      renderFeed(container, items);
      // clear the fulfilled preview for the recipient who just got a new DM
      clearPreviewFor(userKey);
    }

    // Optional re-preview after publish (extra LLM call)
    if (previewAfterPublishEl?.checked) {
      try { await refreshPreviews(); } catch (_) {}
    }
  }

  // ---------- Wire
  function bind() {
    $('saveCfgBtn').addEventListener('click', saveCfg);
    $('clearCfgBtn').addEventListener('click', clearCfg);

    processLimitEl && processLimitEl.addEventListener('change', saveCfg);
    previewOnSendEl && previewOnSendEl.addEventListener('change', saveCfg);
    previewAfterPublishEl && previewAfterPublishEl.addEventListener('change', saveCfg);

    // NEW: JWT setters
    $('useJwtA')?.addEventListener('click', () => {
      authState.A.jwt = (jwtAEl?.value || '').trim();
      log(authState.A.jwt ? '🔐 A token set' : '⚠️ A token cleared');
      saveCfg();
    });
    $('useJwtB')?.addEventListener('click', () => {
      authState.B.jwt = (jwtBEl?.value || '').trim();
      log(authState.B.jwt ? '🔐 B token set' : '⚠️ B token cleared');
      saveCfg();
    });
    $('useJwtOperator')?.addEventListener('click', () => {
      authState.operator.jwt = (jwtOpEl?.value || '').trim();
      log(authState.operator.jwt ? '🔐 Operator token set' : '⚠️ Operator token cleared');
      saveCfg();
    });

    $('sendABtn').addEventListener('click', async () => {
      try {
        const text = userAText.value.trim();
        await sendAs(userAId.value.trim(), text);
        userAText.value = '';
        if (previewOnSendEl?.checked !== false) {
          await refreshPreviews();
        }
      } catch (e) { log('❌ send A error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('sendBBtn').addEventListener('click', async () => {
      try {
        const text = userBText.value.trim();
        await sendAs(userBId.value.trim(), text);
        userBText.value = '';
        if (previewOnSendEl?.checked !== false) {
          await refreshPreviews();
        }
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

    // Manual preview trigger
    previewNowBtn && previewNowBtn.addEventListener('click', async () => {
      try { await refreshPreviews(); }
      catch (e) { log('❌ manual preview error:', e.message, e.response || ''); }
    });
  }

  // ---------- Init
  async function init() {
    loadCfg();
    bind();

    // Seed preview meta labels
    setPreviewMeta('A', lastState.A.lastPreviewAt);
    setPreviewMeta('B', lastState.B.lastPreviewAt);

    // Initial fetch for both users (auth-aware, no publish)
    try {
      const aId = userAId.value.trim();
      const bId = userBId.value.trim();
      const aHeaders = authHeadersForUserId(aId);
      const bHeaders = authHeadersForUserId(bId);

      if (!aHeaders.Authorization) log('⚠️ Paste JWT for User A to fetch A inbox.');
      if (!bHeaders.Authorization) log('⚠️ Paste JWT for User B to fetch B inbox.');

      const [aRes, bRes] = await Promise.all([
        aHeaders.Authorization
          ? apiGet(`/api/get_messages?thread_id=${encodeURIComponent(threadId.value.trim())}&user_id=${encodeURIComponent(aId)}`, aHeaders)
          : Promise.resolve({ items: [] }),
        bHeaders.Authorization
          ? apiGet(`/api/get_messages?thread_id=${encodeURIComponent(threadId.value.trim())}&user_id=${encodeURIComponent(bId)}`, bHeaders)
          : Promise.resolve({ items: [] }),
      ]);

      const aItems = Array.isArray(aRes?.items) ? aRes.items : [];
      const bItems = Array.isArray(bRes?.items) ? bRes.items : [];
      renderFeed(messagesA, aItems);
      renderFeed(messagesB, bItems);

      // Initialize last seen bot message ids
      const latestBotA = aItems.filter(m => m.audience==='bot_to_user' && m.recipient_profile_id === aId)
                               .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))[0];
      const latestBotB = bItems.filter(m => m.audience==='bot_to_user' && m.recipient_profile_id === bId)
                               .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))[0];
      lastState.A.lastBotMsgId = latestBotA?.id || null;
      lastState.B.lastBotMsgId = latestBotB?.id || null;

      // Try an initial preview once
      await refreshPreviews();
    } catch (e) {
      log('❌ initial load error:', e.message, e.response || '');
    }

    setStatus('idle');
    log('🟢 Ready. Tokens set? Send as A/B → previews update immediately. Refresh A/B feed → publish then fetch.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();