// Loop — API Console (vanilla JS)
// Entire file. Drop alongside console.html.

(function () {
  // ------ DOM helpers
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const logEl = $('console');
  const msgsEl = $('messagesList');

  function setStatus(text) {
    statusEl.textContent = text;
  }
  function log(...args) {
    const line = args.map(a => {
      try { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); }
      catch { return String(a); }
    }).join(' ');
    logEl.textContent += `\n${line}`;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function clearLog() { logEl.textContent = ''; }

  // ------ Config fields
  const apiBase = $('apiBase');
  const threadId = $('threadId');
  const operatorId = $('operatorId');
  const recipientUserId = $('recipientUserId');

  const senderUserId = $('senderUserId');
  const messageContent = $('messageContent');

  const autoProcess = $('autoProcess');
  const autoFetch = $('autoFetch');

  const processLimit = $('processLimit');
  const dryRun = $('dryRun');

  const pollToggle = $('pollToggle');
  const pollSeconds = $('pollSeconds');

  // ------ Storage
  const STORAGE_KEY = 'loop_console_cfg_v1';
  function saveCfg() {
    const cfg = {
      apiBase: apiBase.value.trim(),
      threadId: threadId.value.trim(),
      operatorId: operatorId.value.trim(),
      recipientUserId: recipientUserId.value.trim(),
      senderUserId: senderUserId.value.trim(),
      autoProcess: !!autoProcess.checked,
      autoFetch: !!autoFetch.checked,
      processLimit: Number(processLimit.value) || 1,
      dryRun: dryRun.value,
      poll: !!pollToggle.checked,
      pollSeconds: Number(pollSeconds.value) || 5,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    log('✅ Saved config.');
  }
  function loadCfg() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const cfg = JSON.parse(raw);
      apiBase.value = cfg.apiBase || apiBase.value;
      threadId.value = cfg.threadId || '';
      operatorId.value = cfg.operatorId || '';
      recipientUserId.value = cfg.recipientUserId || '';
      senderUserId.value = cfg.senderUserId || '';
      autoProcess.checked = !!cfg.autoProcess;
      autoFetch.checked = !!cfg.autoFetch;
      processLimit.value = cfg.processLimit ?? 1;
      dryRun.value = cfg.dryRun ?? 'false';
      pollToggle.checked = !!cfg.poll;
      pollSeconds.value = cfg.pollSeconds ?? 5;
      log('ℹ️ Loaded saved config.');
    } catch { /* ignore */ }
  }
  function clearCfg() {
    localStorage.removeItem(STORAGE_KEY);
    log('🧹 Cleared saved config (fields unchanged).');
  }

  // ------ API helpers
  function assert(val, msg) {
    if (!val) throw new Error(msg);
  }
  function buildBase() {
    const base = apiBase.value.trim().replace(/\/+$/,'');
    assert(/^https?:\/\//.test(base), 'API Base must be a valid URL.');
    return base;
  }
  async function apiPost(path, body, headers = {}) {
    const base = buildBase();
    const url = `${base}${path}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status} ${resp.statusText}`);
      err.response = json; throw err;
    }
    return json;
  }
  async function apiGet(path) {
    const base = buildBase();
    const url = `${base}${path}`;
    const resp = await fetch(url, { method: 'GET' });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status} ${resp.statusText}`);
      err.response = json; throw err;
    }
    return json;
  }

  // ------ Actions
  async function sendMessage() {
    try {
      setStatus('sending…');
      const tId = threadId.value.trim();
      const sId = senderUserId.value.trim();
      const content = messageContent.value.trim();

      assert(tId, 'Thread ID required.');
      assert(sId, 'Sender User ID required.');
      assert(content, 'Message content required.');

      const res = await apiPost('/api/send_message', {
        thread_id: tId,
        user_id: sId,
        content
      });

      log('📨 /api/send_message →', res);

      if (autoProcess.checked) {
        await runProcess(false); // dry_run=false
      }
      if (autoFetch.checked) {
        await fetchInbox();
      }
      setStatus('idle');
    } catch (err) {
      log('❌ sendMessage error:', err.message, err.response || '');
      setStatus('error');
    }
  }

  async function runProcess(forceDryRun = null) {
    try {
      setStatus('processing…');
      const tId = threadId.value.trim();
      const opId = operatorId.value.trim();
      const limit = Number(processLimit.value) || 1;
      const isDryRun = (forceDryRun !== null)
        ? !!forceDryRun
        : (dryRun.value === 'true');

      assert(tId, 'Thread ID required.');
      assert(opId, 'Operator (X-User-Id) required.');

      const path = `/api/bot/process?thread_id=${encodeURIComponent(tId)}&limit=${limit}&dry_run=${isDryRun}`;
      const res = await apiPost(path, {}, { 'X-User-Id': opId });

      log(`🤖 /api/bot/process (dry_run=${isDryRun}) →`, res);
      setStatus('idle');
      return res;
    } catch (err) {
      log('❌ runProcess error:', err.message, err.response || '');
      setStatus('error');
    }
  }

  function messageRow(m) {
    const created = new Date(m.created_at).toLocaleString();
    const meta = [
      ['id', m.id],
      ['aud', m.audience],
      ['by', m.created_by?.slice(0,8)],
      ['to', m.recipient_profile_id?.slice(0,8)],
    ].map(([k,v]) => `${k}:${v ?? '-'}`).join('  ');
    return `
      <div class="msg">
        <div class="small muted">${created}</div>
        <div style="margin:6px 0 8px 0;">${escapeHtml(m.content ?? '')}</div>
        <div class="small">${meta}</div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;');
  }

  async function fetchInbox() {
    try {
      setStatus('fetching…');
      const tId = threadId.value.trim();
      const rId = recipientUserId.value.trim();
      assert(tId, 'Thread ID required.');
      assert(rId, 'Recipient User ID required (whose inbox to view).');

      const path = `/api/get_messages?thread_id=${encodeURIComponent(tId)}&user_id=${encodeURIComponent(rId)}`;
      const res = await apiGet(path);
      log('📥 /api/get_messages → count:', res?.items?.length ?? 0);

      const items = Array.isArray(res?.items) ? res.items : [];
      msgsEl.innerHTML = items.map(messageRow).join('') || '<div class="small muted">No messages.</div>';
      setStatus('idle');
      return res;
    } catch (err) {
      log('❌ fetchInbox error:', err.message, err.response || '');
      setStatus('error');
    }
  }

  // ------ Polling
  let pollTimer = null;
  function startPolling() {
    stopPolling();
    const sec = Math.max(2, Number(pollSeconds.value) || 5);
    pollTimer = setInterval(fetchInbox, sec * 1000);
    log(`⏱️ Polling every ${sec}s`);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ------ Wire UI
  function bind() {
    $('saveCfgBtn').addEventListener('click', saveCfg);
    $('clearCfgBtn').addEventListener('click', clearCfg);
    $('sendBtn').addEventListener('click', sendMessage);
    $('processBtn').addEventListener('click', () => runProcess(null));
    $('fetchBtn').addEventListener('click', fetchInbox);
    $('clearLogBtn').addEventListener('click', clearLog);

    pollToggle.addEventListener('change', () => {
      if (pollToggle.checked) startPolling(); else { stopPolling(); log('⏹️ Polling stopped'); }
      saveCfg();
    });
    pollSeconds.addEventListener('change', () => { if (pollToggle.checked) startPolling(); saveCfg(); });
  }

  // ------ Init
  function init() {
    loadCfg();
    bind();
    setStatus('idle');
    log('🟢 Ready. Fill the IDs, type a message, press “Send”.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();