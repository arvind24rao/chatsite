// Loop — Four-Panel Console
// Behaviour:
// - After Send as A/B: POST /api/send_message, then (optionally) POST /api/bot/process?dry_run=true to compute preview,
//   then update single preview panels (Bot→A/B). If no preview content is returned, show "No preview available."
// - On Refresh A/B feed: first POST /api/bot/process?dry_run=false (publish), then GET /api/get_messages.
//   If no *new* bot_to_user message since last refresh for that user, show "No new updates since last refresh at HH:MM:SS".
//
// This version adds:
// - Process limit control (affects both dry-run and publish)
// - Preview-on-send toggle (default ON)
// - Optional preview-after-publish toggle
// - Manual "Preview now" button
// - Clear preview for a user after a new DM for that user is published
// - Preview timestamp labels
//
// NOTE: Any replacements to prior code are commented with `// OLD:` above the new line(s).

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

  
  // Supabase controls + optional per-user threads
  const sbUrlEl = $('sbUrl');
  const sbAnonEl = $('sbAnon');
  const botEmailEl = $('botEmail');
  const botPassEl = $('botPass');
  const botStatusEl = $('botStatus');
  const btnInitSupabase = $('btnInitSupabase');
  const autoLoginBotEl = $('autoLoginBot');
  const threadIdAEl = $('threadIdA');
  const threadIdBEl = $('threadIdB');
// ---------- State for "no new updates" comparison
  // OLD:
  // const lastState = {
  //   A: { lastBotMsgId: null, lastRefresh: null },
  //   B: { lastBotMsgId: null, lastRefresh: null },
  // };
  const lastState = {
    A: { lastBotMsgId: null, lastRefresh: null, lastPreviewAt: null },
    B: { lastBotMsgId: null, lastRefresh: null, lastPreviewAt: null },
  };

  
  // Supabase client + IDs
  let supabaseClient = null;
  let uidA = null, uidB = null, uidBot = null;
// ---------- Storage
  const STORAGE_KEY = 'loop_four_panel_cfg_v3';
  function saveCfg() {
    const cfg = {
      apiBase: apiBase.value.trim(),
      threadId: threadId.value.trim(),
      operatorId: operatorId.value.trim(),
      userAId: userAId.value.trim(),
      userBId: userBId.value.trim(),
      threadIdA: (threadIdAEl?.value || '').trim(),
      threadIdB: (threadIdBEl?.value || '').trim(),
      sbUrl: sbUrlEl?.value || '',
      sbAnon: sbAnonEl?.value || '',
      botEmail: botEmailEl?.value || '',
      botPass: botPassEl?.value || '',
      // NEW persisted settings
      processLimit: Number(processLimitEl?.value || 10),
      previewOnSend: !!(previewOnSendEl?.checked ?? true),
      previewAfterPublish: !!(previewAfterPublishEl?.checked ?? false),
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
      // NEW: load persisted settings if present
      if (processLimitEl && Number.isFinite(cfg.processLimit)) processLimitEl.value = String(cfg.processLimit);
      if (typeof cfg.previewOnSend === 'boolean' && previewOnSendEl) previewOnSendEl.checked = cfg.previewOnSend;
      if (typeof cfg.previewAfterPublish === 'boolean' && previewAfterPublishEl) previewAfterPublishEl.checked = cfg.previewAfterPublish;

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

  // --- NEW helpers ---
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

  // ---------- API composites
  async function sendAs(userId, text) {
    const tId = threadForUserId(userId);
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
    const tId = threadForUserId(userId);
    const op = operatorId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(op, 'Bot operator (X-User-Id) required.');
    setStatus('previewing…');
    try {
      // OLD:
      // const res = await apiPost(
      //   `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=10&dry_run=true`,
      //   {},
      //   { 'X-User-Id': op }
      // );
      const res = await apiPost(
        `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=${getProcessLimit()}&dry_run=true`,
        {},
        { 'X-User-Id': op }
      );
      log('🤖 preview /api/bot/process (dry_run=true) →', { stats: res?.stats, items: (res?.items||[]).length });
      const previews = extractPreviews(res);
      renderSinglePreview(botToAPreview, previews[userAId.value.trim()] || '');
      renderSinglePreview(botToBPreview, previews[userBId.value.trim()] || '');

      // record timestamps and update meta labels
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

  // Publish latest bot messages, fetch inbox for a recipient, update "no new updates" UX
  async function publishThenFetchFor(userKey /* 'A'|'B' */) {
    const tId = threadForUserId(userId);
    const op = operatorId.value.trim();
    assert(tId, 'Thread ID required.');
    assert(op, 'Bot operator (X-User-Id) required.');
    const recipient = (userKey === 'A') ? userAId.value.trim() : userBId.value.trim();
    const container = (userKey === 'A') ? messagesA : messagesB;

    setStatus('publishing…');
    try {
      // OLD:
      // await apiPost(
      //   `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=10&dry_run=false`,
      //   {},
      //   { 'X-User-Id': op }
      // );
      await apiPost(
        `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=${getProcessLimit()}&dry_run=false`,
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

    // OLD:
    // if (!newest || newest.id === prevId) {
    //   showNoNewUpdates(container, state.lastRefresh);
    // } else {
    //   state.lastBotMsgId = newest.id;
    //   renderFeed(container, items);
    // }
    if (!newest || newest.id === prevId) {
      showNoNewUpdates(container, state.lastRefresh);
    } else {
      state.lastBotMsgId = newest.id;
      renderFeed(container, items);

      // NEW: clear the fulfilled preview for the recipient who just got a new DM
      clearPreviewFor(userKey);
    }

    // NEW: optional re-preview after publish (costs an extra LLM call)
    if (previewAfterPublishEl?.checked) {
      try { await refreshPreviews(); } catch (_) {}
    }
  }

  // ---------- Wire
  function bind() {
    $('saveCfgBtn').addEventListener('click', saveCfg);
    $('clearCfgBtn').addEventListener('click', clearCfg);

    // Optional: persist when changing controls without hitting Save
    processLimitEl && processLimitEl.addEventListener('change', saveCfg);
    previewOnSendEl && previewOnSendEl.addEventListener('change', saveCfg);
    previewAfterPublishEl && previewAfterPublishEl.addEventListener('change', saveCfg);

    // Supabase init & bot login
    if (btnInitSupabase) btnInitSupabase.addEventListener('click', async () => {
      if (!await ensureSupabase()) return;
      await loginBot();
      saveCfg();
    });
    if (autoLoginBotEl && autoLoginBotEl.checked) {
      (async ()=>{ if(await ensureSupabase()) await loginBot(); })();
    }
    if ($('btnSaveLoopThread')) {
      $('btnSaveLoopThread').addEventListener('click', ()=>{
        localStorage.setItem('loopId', $('loopId')?.value?.trim() || '');
        localStorage.setItem('threadIdA', threadIdAEl?.value?.trim() || '');
        localStorage.setItem('threadIdB', threadIdBEl?.value?.trim() || '');
        const lt = $('ltStatus'); if (lt) lt.textContent = 'Saved.';
        saveCfg();
      });
    }

    $('sendABtn').addEventListener('click', async () => {
      try {
        const text = userAText.value.trim();
        await sendAs(userAId.value.trim(), text);
        userAText.value = '';
        // OLD: await refreshPreviews();
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
        // OLD: await refreshPreviews();
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

    // NEW: manual preview trigger
    previewNowBtn && previewNowBtn.addEventListener('click', async () => {
      try { await refreshPreviews(); }
      catch (e) { log('❌ manual preview error:', e.message, e.response || ''); }
    });
  }

  // ---------- Init
  async function init() {
    loadCfg();
    // Prefill per-user thread inputs if present
    if (threadIdAEl) threadIdAEl.value = localStorage.getItem('threadIdA') || threadIdAEl.value || '';
    if (threadIdBEl) threadIdBEl.value = localStorage.getItem('threadIdB') || threadIdBEl.value || '';
    bind();

    // Seed preview meta labels (optional)
    setPreviewMeta('A', lastState.A.lastPreviewAt);
    setPreviewMeta('B', lastState.B.lastPreviewAt);

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
})()
  // ---------- Supabase helpers (non-destructive)
  async function ensureSupabase() {
    const url = sbUrlEl?.value?.trim();
    const anon = sbAnonEl?.value?.trim();
    if (!url || !anon) { log('ℹ️ Fill Supabase URL & Anon key to enable auto-login.'); return false; }
    if (!supabaseClient && window.supabase) {
      supabaseClient = window.supabase.createClient(url, anon);
      log('🔌 Supabase client initialised.');
    }
    return !!supabaseClient;
  }

  async function loginBot() {
    if (!supabaseClient) return;
    const botEmail = botEmailEl?.value?.trim();
    const botPass = botPassEl?.value?.trim();
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email: botEmail, password: botPass });
      if (error) throw error;
      authState.operator.jwt = data.session.access_token;
      jwtOpEl && (jwtOpEl.value = authState.operator.jwt);
      uidBot = data.session.user.id;
      operatorId && (operatorId.value = uidBot);
      botStatusEl && (botStatusEl.textContent = `✅ Bot logged in (${botEmail})`);
      supabaseClient.auth.onAuthStateChange((_evt, session) => {
        if (session?.access_token) {
          authState.operator.jwt = session.access_token;
          if (jwtOpEl) jwtOpEl.value = session.access_token;
          log('🔄 Bot token refreshed');
        }
      });
      log('🤖 Bot auto-login complete:', uidBot);
    } catch (e) {
      botStatusEl && (botStatusEl.textContent = `❌ Bot login failed`);
      log('❌ Bot login failed:', e.message || e);
    }
  }

  async function loginUser(role, email, password) {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { alert(`${role} login failed: ${error.message}`); return null; }
    const token = data.session.access_token;
    const id = data.session.user.id;
    if (role === 'A') { authState.A.jwt = token; if (jwtAEl) jwtAEl.value = token; if (userAId) userAId.value = id; uidA = id; }
    if (role === 'B') { authState.B.jwt = token; if (jwtBEl) jwtBEl.value = token; if (userBId) userBId.value = id; uidB = id; }
    log(`✅ ${role} logged in — id=${id}`);
    return { token, id };
  }

  // Prefer per-user thread inputs if present
  function threadForUserId(userId) {
    const aId = userAId?.value?.trim();
    const bId = userBId?.value?.trim();
    const tA = threadIdAEl?.value?.trim();
    const tB = threadIdBEl?.value?.trim();
    if (userId && aId && userId === aId && tA) return tA;
    if (userId && bId && userId === bId && tB) return tB;
    return threadId?.value?.trim();
  }
;