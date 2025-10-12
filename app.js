// Loop — Four-Panel Console (Preview + Publish; single current preview per user)
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
  const dryRunMode = $('dryRunMode');

  const userAId = $('userAId');
  const userAText = $('userAText');
  const messagesA = $('messagesA');

  const userBId = $('userBId');
  const userBText = $('userBText');
  const messagesB = $('messagesB');

  const botToAPreview = $('botToAPreview');
  const botToBPreview = $('botToBPreview');

  // ---------- Storage
  const STORAGE_KEY = 'loop_four_panel_cfg_v2';
  function saveCfg() {
    const cfg = {
      apiBase: apiBase.value.trim(),
      threadId: threadId.value.trim(),
      operatorId: operatorId.value.trim(),
      userAId: userAId.value.trim(),
      userBId: userBId.value.trim(),
      dryRunMode: dryRunMode.value
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
      if (cfg.dryRunMode) dryRunMode.value = cfg.dryRunMode;
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

  // ---------- Rendering
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
      : `<span class="muted">No preview text.</span>`;
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

  async function processBot(dryRun) {
    const tId = threadId.value.trim();
    const op = operatorId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(op, 'Bot operator (X-User-Id) required.');
    setStatus(dryRun ? 'previewing…' : 'publishing…');
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
    const res = await apiGet(`/api/get_messages?thread_id=${encodeURIComponent(tId)}&user_id=${encodeURIComponent(userId)}`);
    log('📥 /api/get_messages →', `user:${userId.slice(0,8)} count:${res?.items?.length ?? 0}`);
    return Array.isArray(res?.items) ? res.items : [];
  }

  // ---------- Preview extraction
  // Expecting server to return previews on dry_run=true as:
  // items[].previews = [{ recipient_profile_id, content }]
  function extractPreviews(res) {
    const previews = {};
    const items = res?.items ?? [];
    for (const it of items) {
      const list = it.previews || it.proposed || it.bot_to_user_preview || [];
      if (Array.isArray(list)) {
        for (const p of list) {
          const rid = p?.recipient_profile_id || p?.recipient || p?.to;
          const text = p?.content || p?.text;
          if (rid && text) previews[rid] = text; // last one wins (latest)
        }
      }
    }
    return previews;
  }

  // ---------- Wire
  function bind() {
    $('saveCfgBtn').addEventListener('click', saveCfg);
    $('clearCfgBtn').addEventListener('click', clearCfg);

    // Send as A → optional publish if dryRunMode=false; else just preview later
    $('sendABtn').addEventListener('click', async () => {
      try {
        await sendAs(userAId.value.trim(), userAText.value.trim());
        userAText.value = '';
        // If user wants immediate publish, run process(false)
        if (dryRunMode.value === 'false') await processBot(false);
        // Always refresh feeds so the left panels reflect latest
        const [aItems, bItems] = await Promise.all([
          fetchInboxFor(userAId.value.trim()),
          fetchInboxFor(userBId.value.trim())
        ]);
        renderFeed(messagesA, aItems);
        renderFeed(messagesB, bItems);
      } catch (e) { log('❌ send A error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('sendBBtn').addEventListener('click', async () => {
      try {
        await sendAs(userBId.value.trim(), userBText.value.trim());
        userBText.value = '';
        if (dryRunMode.value === 'false') await processBot(false);
        const [aItems, bItems] = await Promise.all([
          fetchInboxFor(userAId.value.trim()),
          fetchInboxFor(userBId.value.trim())
        ]);
        renderFeed(messagesA, aItems);
        renderFeed(messagesB, bItems);
      } catch (e) { log('❌ send B error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('refreshABtn').addEventListener('click', async () => {
      try { renderFeed(messagesA, await fetchInboxFor(userAId.value.trim())); }
      catch (e) { log('❌ refresh A error:', e.message, e.response || ''); setStatus('error'); }
    });

    $('refreshBBtn').addEventListener('click', async () => {
      try { renderFeed(messagesB, await fetchInboxFor(userBId.value.trim())); }
      catch (e) { log('❌ refresh B error:', e.message, e.response || ''); setStatus('error'); }
    });

    // Refresh Preview → calls processBot(dryRunMode) and shows single current preview per user
    $('previewBtn').addEventListener('click', async () => {
      try {
        const useDryRun = (dryRunMode.value === 'true');
        const res = await processBot(useDryRun);
        if (!useDryRun) {
          // If user toggled to publish mode and clicked "Refresh Preview", we just published.
          // After publishing, clear preview panels and let feeds show new messages.
          renderSinglePreview(botToAPreview, '');
          renderSinglePreview(botToBPreview, '');
          const [aItems, bItems] = await Promise.all([
            fetchInboxFor(userAId.value.trim()),
            fetchInboxFor(userBId.value.trim())
          ]);
          renderFeed(messagesA, aItems);
          renderFeed(messagesB, bItems);
          return;
        }
        const previews = extractPreviews(res);
        renderSinglePreview(botToAPreview, previews[userAId.value.trim()] || '');
        renderSinglePreview(botToBPreview, previews[userBId.value.trim()] || '');
      } catch (e) {
        log('❌ preview error:', e.message, e.response || '');
        setStatus('error');
      }
    });

    // Publish Latest → force insert with dry_run=false
    $('publishBtn').addEventListener('click', async () => {
      try {
        await processBot(false);
        // After publishing, recipients can “Refresh feed” to receive latest bot message
        const [aItems, bItems] = await Promise.all([
          fetchInboxFor(userAId.value.trim()),
          fetchInboxFor(userBId.value.trim())
        ]);
        renderFeed(messagesA, aItems);
        renderFeed(messagesB, bItems);
      } catch (e) {
        log('❌ publish error:', e.message, e.response || '');
        setStatus('error');
      }
    });
  }

  // ---------- Init
  async function init() {
    loadCfg();
    bind();
    // Initial fetch of A/B feeds
    try {
      const [aItems, bItems] = await Promise.all([
        fetchInboxFor(userAId.value.trim()),
        fetchInboxFor(userBId.value.trim())
      ]);
      renderFeed(messagesA, aItems);
      renderFeed(messagesB, bItems);
    } catch {}
    setStatus('idle');
    log('🟢 Ready. Send as A/B. Use Dry-run Mode + Refresh Preview for proposed text. Use Publish to insert messages.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();