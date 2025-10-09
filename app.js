// chatsite/app.js
//
// Loop — Live Demo wiring
// - Saves Thread / User A / User B IDs
// - Sends human messages (A or B) -> /api/send_message
// - Pulls merged streams per viewer -> /api/get_messages
// - Renders 4 panes: A (human), B (human), Bot→A, Bot→B
// - Optional: trigger /bot/process (may require backend auth; handled gracefully)

(function () {
  // ---------- Config ----------
  // If you're using Netlify proxy, leave baseURL empty so we call "/api/...".
  // If you want to call the API directly (no proxy), set e.g. "https://api.loopasync.com"
  // const CONFIG = {
  //   baseURL: "", // "" => same-origin proxy via netlify.toml
  //   pollMs: 2000,
  //   fetchLimit: 200,
  // };

  const CONFIG = {
  baseURL: "https://api.loopasync.com", // call API directly; bypass site proxy
     pollMs: 2000,
     fetchLimit: 200,
   };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const elThread = $("threadId");
  const elA = $("userAId");
  const elB = $("userBId");

  const btnSave = $("saveConfig");
  const btnRefresh = $("refreshBoth");
  const btnToggle = $("togglePolling");
  const btnProcess = $("processBot");
  const statusConfig = $("configStatus");

  const feedA = $("feedA");
  const feedB = $("feedB");
  const feedBotA = $("feedBotA");
  const feedBotB = $("feedBotB");

  const inputA = $("inputA");
  const inputB = $("inputB");
  const sendA = $("sendA");
  const sendB = $("sendB");

  // ---------- Storage ----------
  const LS_KEYS = {
    thread: "loop.thread",
    userA: "loop.userA",
    userB: "loop.userB",
  };

  function saveConfig() {
    const threadId = (elThread.value || "").trim();
    const userAId = (elA.value || "").trim();
    const userBId = (elB.value || "").trim();
    localStorage.setItem(LS_KEYS.thread, threadId);
    localStorage.setItem(LS_KEYS.userA, userAId);
    localStorage.setItem(LS_KEYS.userB, userBId);
    statusConfig.textContent = "Saved.";
    setTimeout(() => (statusConfig.textContent = "Enter IDs and click Save."), 1500);
    return { threadId, userAId, userBId };
  }

  function loadConfig() {
    const threadId = localStorage.getItem(LS_KEYS.thread) || "";
    const userAId = localStorage.getItem(LS_KEYS.userA) || "";
    const userBId = localStorage.getItem(LS_KEYS.userB) || "";
    elThread.value = threadId;
    elA.value = userAId;
    elB.value = userBId;
    return { threadId, userAId, userBId };
  }

  function getConfig() {
    return {
      threadId: (elThread.value || "").trim(),
      userAId: (elA.value || "").trim(),
      userBId: (elB.value || "").trim(),
    };
  }

  // ---------- HTTP ----------
  function apiURL(path) {
    if (CONFIG.baseURL) return `${CONFIG.baseURL}${path}`;
    return path; // same-origin (Netlify proxy)
  }

  async function httpJSON(url, opts = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      // no-op
    }
    if (!res.ok) {
      const msg =
        (body && (body.detail || body.reason)) ||
        `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return body;
  }

  // ---------- API calls ----------
  async function sendMessage({ threadId, userId, content }) {
    const url = apiURL("/api/send_message");
    return httpJSON(url, {
      method: "POST",
      body: JSON.stringify({ thread_id: threadId, user_id: userId, content }),
    });
  }

  async function getMessages({ threadId, userId }) {
    const url = apiURL(
      `/api/get_messages?thread_id=${encodeURIComponent(
        threadId
      )}&user_id=${encodeURIComponent(userId)}&limit=${CONFIG.fetchLimit}`
    );
    return httpJSON(url);
  }

  async function processBot({ threadId }) {
    // Note: Backend may require `X-User-Id` of an authorised bot. We call without it;
    // if 401/403 is returned, we show that info and continue.
    const url = apiURL(
      `/bot/process${threadId ? `?thread_id=${encodeURIComponent(threadId)}` : ""}`
    );
    try {
      const res = await httpJSON(url, { method: "POST" });
      flash("Process OK", `Processed=${res?.stats?.processed ?? 0}, Inserted=${res?.stats?.inserted ?? 0}`);
      return res;
    } catch (e) {
      flash("Process failed", String(e.message || e));
      throw e;
    }
  }

  // ---------- Render ----------
  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso || "";
    }
  }

  function createMsgEl(item) {
    const wrap = document.createElement("div");
    wrap.className = "msg";
    const content = document.createElement("div");
    content.textContent = item.content || "";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [
      item.audience,
      item.recipient_profile_id ? `to:${item.recipient_profile_id}` : null,
      `by:${item.created_by || "?"}`,
      fmtDate(item.created_at),
    ]
      .filter(Boolean)
      .join(" · ");
    wrap.appendChild(content);
    wrap.appendChild(meta);
    return wrap;
  }

  function renderFeed(el, items) {
    el.innerHTML = "";
    items.forEach((it) => el.appendChild(createMsgEl(it)));
    el.scrollTop = el.scrollHeight;
  }

  function splitBucketsFromViewerResponse(resp, viewerId) {
    // /api/get_messages returns:
    // - viewer's own human->bot messages
    // - bot->viewer DMs
    const items = resp?.items || [];
    const human = items.filter(
      (m) => m.audience === "inbox_to_bot" && m.created_by?.toLowerCase() === viewerId.toLowerCase()
    );
    const botToViewer = items.filter(
      (m) => m.audience === "bot_to_user" && (m.recipient_profile_id || "").toLowerCase() === viewerId.toLowerCase()
    );
    return { human, botToViewer };
  }

  // ---------- UX helpers ----------
  let pollTimer = null;

  function setPolling(running) {
    btnToggle.dataset.running = running ? "true" : "false";
    btnToggle.textContent = running ? "Stop Polling" : "Start Polling";
  }

  function flash(title, detail) {
    console.log(`[${title}] ${detail || ""}`);
    statusConfig.textContent = `${title}${detail ? ` — ${detail}` : ""}`;
    setTimeout(() => (statusConfig.textContent = "Enter IDs and click Save."), 2500);
  }

  function validateIDs({ threadId, userAId, userBId }) {
    if (!threadId || !userAId || !userBId) {
      flash("Missing IDs", "Provide Thread, User A, and User B, then Save.");
      return false;
    }
    return true;
  }

  // ---------- Orchestration ----------
  async function refreshBothOnce() {
    const { threadId, userAId, userBId } = getConfig();
    if (!validateIDs({ threadId, userAId, userBId })) return;

    try {
      const [respA, respB] = await Promise.all([
        getMessages({ threadId, userId: userAId }),
        getMessages({ threadId, userId: userBId }),
      ]);

      const { human: aHuman, botToViewer: botToA } = splitBucketsFromViewerResponse(
        respA,
        userAId
      );
      const { human: bHuman, botToViewer: botToB } = splitBucketsFromViewerResponse(
        respB,
        userBId
      );

      renderFeed(feedA, aHuman);
      renderFeed(feedB, bHuman);
      renderFeed(feedBotA, botToA);
      renderFeed(feedBotB, botToB);
    } catch (e) {
      flash("Refresh failed", String(e.message || e));
    }
  }

  function startPolling() {
    if (pollTimer) return;
    setPolling(true);
    pollTimer = setInterval(refreshBothOnce, CONFIG.pollMs);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
    setPolling(false);
  }

  // ---------- Events ----------
  btnSave.addEventListener("click", () => saveConfig());

  btnRefresh.addEventListener("click", () => refreshBothOnce());

  btnToggle.addEventListener("click", () => {
    const running = btnToggle.dataset.running === "true";
    if (running) stopPolling();
    else startPolling();
  });

  btnProcess.addEventListener("click", async () => {
    const { threadId } = getConfig();
    if (!threadId) {
      flash("Missing Thread ID", "Enter a Thread ID, then Save.");
      return;
    }
    try {
      await processBot({ threadId });
      // After processing, refresh panes
      await refreshBothOnce();
    } catch {
      // error already flashed
    }
  });

  sendA.addEventListener("click", async () => {
    const { threadId, userAId, userBId } = getConfig();
    if (!validateIDs({ threadId, userAId, userBId })) return;
    const text = (inputA.value || "").trim();
    if (!text) return;
    try {
      await sendMessage({ threadId, userId: userAId, content: text });
      inputA.value = "";
      await refreshBothOnce();
    } catch (e) {
      flash("Send (A) failed", String(e.message || e));
    }
  });

  sendB.addEventListener("click", async () => {
    const { threadId, userAId, userBId } = getConfig();
    if (!validateIDs({ threadId, userAId, userBId })) return;
    const text = (inputB.value || "").trim();
    if (!text) return;
    try {
      await sendMessage({ threadId, userId: userBId, content: text });
      inputB.value = "";
      await refreshBothOnce();
    } catch (e) {
      flash("Send (B) failed", String(e.message || e));
    }
  });

  // ---------- Boot ----------
  (function init() {
    loadConfig();
    setPolling(false);
  })();
})();