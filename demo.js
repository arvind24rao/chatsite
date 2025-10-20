// Demo (preview-only) — hardcoded config, no feeds, no connection box, no logs
(() => {
  // ----- Hardcoded config (verified set) -----
  const API_BASE = 'https://api.loopasync.com';
  const THREAD_ID = '86fe2f0e-a4ac-4ef7-a283-a24fe735d49b';
  const BOT_ID    = 'b59042b5-9cee-4c20-ad5d-8a0ad42cb374';
  const USER_A_ID = 'c9cf9661-346c-4f9d-a549-66137f29d87e';
  const USER_B_ID = '21520d4c-3c62-46d1-b056-636ca91481a2';

  // ----- DOM -----
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');

  const userAText = $('userAText');
  const userBText = $('userBText');
  const sendABtn  = $('sendABtn');
  const sendBBtn  = $('sendBBtn');
  const previewBtn = $('previewBtn');

  const botToAPreview = $('botToAPreview');
  const botToBPreview = $('botToBPreview');

  const clearA   = $('clearA');
  const clearB   = $('clearB');
  const clearBot = $('clearBot');
  const drainBtn = $('drainBtn');

  // ----- Helpers -----
  const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };
  const escapeHtml = (s) => String(s)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  async function apiPost(path, body, headers = {}) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) {
      const text = await res.text().catch(()=>'');
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    return res.json().catch(()=> ({}));
  }

  // Send and queue a human message
  async function sendAs(userId, text) {
    if (!text || !text.trim()) return;
    setStatus('sending…');
    try {
      await apiPost('/api/send_message', {
        thread_id: THREAD_ID,
        user_id: userId,
        content: text.trim()
      });
    } finally {
      setStatus('idle');
    }
  }

  // Compute previews by processing queue in dry_run mode (no writes)
  async function refreshPreviews() {
    setStatus('previewing…');
    try {
      const res = await apiPost(
        `/api/bot/process?thread_id=${encodeURIComponent(THREAD_ID)}&limit=10&dry_run=true`,
        {},
        { 'X-User-Id': BOT_ID }
      );

      // Extract previews per current Console logic
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

      renderSinglePreview(botToAPreview, previews[USER_A_ID] || '');
      renderSinglePreview(botToBPreview, previews[USER_B_ID] || '');
    } catch (e) {
      renderSinglePreview(botToAPreview, `Preview error:\n${escapeHtml(e.message)}`);
      renderSinglePreview(botToBPreview, '');
    } finally {
      setStatus('idle');
    }
  }

  function renderSinglePreview(container, text) {
    if (!container) return;
    if (!text) {
      container.innerHTML = '<span class="muted">No preview available.</span>';
      return;
    }
    container.innerHTML = escapeHtml(text);
  }

  // Publish + mark processed to drain backlog
  async function drainBacklog() {
    setStatus('draining…');
    try {
      await apiPost(
        `/api/bot/process?thread_id=${encodeURIComponent(THREAD_ID)}&limit=100&dry_run=false`,
        {},
        { 'X-User-Id': BOT_ID }
      );
      // Optional: clear current previews after draining
      renderSinglePreview(botToAPreview, '');
      renderSinglePreview(botToBPreview, '');
    } catch (e) {
      // Show error in one of the boxes
      renderSinglePreview(botToAPreview, `Drain error:\n${escapeHtml(e.message)}`);
    } finally {
      setStatus('idle');
    }
  }

  // ----- Wire -----
  sendABtn?.addEventListener('click', async () => {
    try {
      const text = userAText.value;
      userAText.value = '';
      await sendAs(USER_A_ID, text);
      await refreshPreviews();
    } catch (_) { setStatus('error'); }
  });

  sendBBtn?.addEventListener('click', async () => {
    try {
      const text = userBText.value;
      userBText.value = '';
      await sendAs(USER_B_ID, text);
      await refreshPreviews();
    } catch (_) { setStatus('error'); }
  });

  previewBtn?.addEventListener('click', async () => {
    try { await refreshPreviews(); }
    catch (_) { setStatus('error'); }
  });

  clearA?.addEventListener('click', () => {
    userAText.value = '';
  });

  clearB?.addEventListener('click', () => {
    userBText.value = '';
  });

  clearBot?.addEventListener('click', () => {
    renderSinglePreview(botToAPreview, '');
    renderSinglePreview(botToBPreview, '');
  });

  drainBtn?.addEventListener('click', async () => {
    await drainBacklog();
  });

  // On load: nothing to fetch; previews are on-demand
  setStatus('idle');
})();