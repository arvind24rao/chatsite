/* app.js
 *
 * Expected HTML element IDs:
 *  - Inputs:    threadId, profileA, profileB, botId, baseURL (optional)
 *  - Buttons:   saveIdsBtn, refreshBtn, pollBtn, processBtn, sendABtn, sendBBtn
 *  - Textareas: inputA, inputB
 *  - Panes:     paneA, paneB
 *  - Status:    status
 *
 * Endpoints (served by loop-api):
 *   GET  {baseURL}/api/get_messages?thread_id=...&user_id=...&limit=...
 *   POST {baseURL}/api/send_message        JSON {thread_id, user_id, content}
 *   POST {baseURL}/bot/process?thread_id=...   (requires header X-User-Id: BOT_ID)
 *   GET  {baseURL}/health
 */

const CONFIG = {
  baseURL: "",
  get threadId()   { return document.getElementById("threadId").value.trim(); },
  get profileA()   { return document.getElementById("profileA").value.trim(); },
  get profileB()   { return document.getElementById("profileB").value.trim(); },
  get botId()      { return document.getElementById("botId").value.trim(); },
  // set threadId(v)  { document.getElementById("threadId").value = v || ""; },
  // set profileA(v)  { document.getElementById("profileA").value = v || ""; },
  // set profileB(v)  { document.getElementById("profileB").value = v || ""; },
  // set botId(v)     { document.getElementById("botId").value = v || ""; },
  function setField(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function loadFromStorage() {
  const data = JSON.parse(localStorage.getItem("loopConfig") || "{}");
  setField("profileA", data.profileA || "");
  setField("profileB", data.profileB || "");
  setField("threadId", data.threadId || "");
  setField("botId", data.botId || "");
  setField("baseURL", data.baseURL || "https://api.loopasync.com");
}
};

const els = {
  paneA:     () => document.getElementById("paneA"),
  paneB:     () => document.getElementById("paneB"),
  inputA:    () => document.getElementById("inputA"),
  inputB:    () => document.getElementById("inputB"),
  status:    () => document.getElementById("status"),
  baseURL:   () => document.getElementById("baseURL"), // optional text input
  saveBtn:   () => document.getElementById("saveIdsBtn"),
  refresh:   () => document.getElementById("refreshBtn"),
  poll:      () => document.getElementById("pollBtn"),
  process:   () => document.getElementById("processBtn"),
  sendA:     () => document.getElementById("sendABtn"),
  sendB:     () => document.getElementById("sendBBtn"),
};

let polling = false;
let pollTimer = null;

function setStatus(msg, kind = "info") {
  const el = els.status();
  if (!el) return;
  el.textContent = msg;
  el.dataset.kind = kind; // for styling if you want
}

function loadFromStorage() {
  const stored = JSON.parse(localStorage.getItem("loopdemo") || "{}");
  CONFIG.baseURL = stored.baseURL || (els.baseURL() ? els.baseURL().value.trim() : "") || "https://api.loopasync.com";
  if (els.baseURL()) els.baseURL().value = CONFIG.baseURL;
  CONFIG.threadId = stored.threadId || "";
  CONFIG.profileA = stored.profileA || "";
  CONFIG.profileB = stored.profileB || "";
  CONFIG.botId    = stored.botId    || "";
}

function saveToStorage() {
  const obj = {
    baseURL: (els.baseURL() ? els.baseURL().value.trim() : CONFIG.baseURL) || CONFIG.baseURL || "",
    threadId: CONFIG.threadId,
    profileA: CONFIG.profileA,
    profileB: CONFIG.profileB,
    botId:    CONFIG.botId,
  };
  localStorage.setItem("loopdemo", JSON.stringify(obj));
  CONFIG.baseURL = obj.baseURL || CONFIG.baseURL;
  setStatus("IDs saved.", "ok");
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }
  return res.json();
}

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function renderPane(el, label, items) {
  if (!el) return;
  const html = [
    `<div class="paneHeader">${label}</div>`,
    ...items.map(m => {
      const meta = [
        m.audience,
        m.recipient_profile_id ? `to:${m.recipient_profile_id}` : "",
        m.created_by ? `by:${m.created_by}` : "",
        fmtTime(m.created_at),
      ].filter(Boolean).join(" · ");
      return `
        <div class="msg">
          <div class="content">${escapeHTML(m.content || "")}</div>
          <div class="meta">${meta}</div>
        </div>
      `;
    })
  ].join("\n");
  el.innerHTML = html;
}

function escapeHTML(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getFeedFor(userId) {
  const url = `${CONFIG.baseURL}/api/get_messages?thread_id=${encodeURIComponent(CONFIG.threadId)}&user_id=${encodeURIComponent(userId)}&limit=200`;
  return fetchJSON(url);
}

function splitBuckets(all, aId, bId) {
  const is = (x, y) => (x || "").toLowerCase() === (y || "").toLowerCase();

  const a_inbox_to_bot = all.filter(m =>
    m.audience === "inbox_to_bot" && is(m.created_by, aId)
  );
  const b_inbox_to_bot = all.filter(m =>
    m.audience === "inbox_to_bot" && is(m.created_by, bId)
  );

  const bot_to_a = all.filter(m =>
    m.audience === "bot_to_user" && is(m.recipient_profile_id, aId)
  );
  const bot_to_b = all.filter(m =>
    m.audience === "bot_to_user" && is(m.recipient_profile_id, bId)
  );

  // Sort newest first
  const byTimeDesc = (x, y) => (y.created_at || "").localeCompare(x.created_at || "");
  [a_inbox_to_bot, b_inbox_to_bot, bot_to_a, bot_to_b].forEach(arr => arr.sort(byTimeDesc));

  return { a_inbox_to_bot, b_inbox_to_bot, bot_to_a, bot_to_b };
}

async function refreshBoth() {
  if (!CONFIG.threadId || !CONFIG.profileA || !CONFIG.profileB) {
    setStatus("Missing Thread/A/B IDs.", "warn");
    return;
  }
  try {
    setStatus("Loading feeds...");
    const [aView, bView] = await Promise.all([
      getFeedFor(CONFIG.profileA),
      getFeedFor(CONFIG.profileB),
    ]);

    const aBuckets = splitBuckets(aView.items || [], CONFIG.profileA, CONFIG.profileB);
    const bBuckets = splitBuckets(bView.items || [], CONFIG.profileA, CONFIG.profileB);

    // For display we want: A own → (inbox_to_bot by A), B own → (inbox_to_bot by B),
    // plus Bot→A and Bot→B (either view has the same bot_to_X rows).
    renderPane(els.paneA(), "Human A → Bot (inbox_to_bot)", aBuckets.a_inbox_to_bot);
    // Append Bot→A under A pane
    const paneA = els.paneA();
    if (paneA) {
      paneA.innerHTML += `<hr class="sep" />`;
      renderAppend(paneA, "Bot → A (bot_to_user)", aBuckets.bot_to_a.length ? aBuckets.bot_to_a : bBuckets.bot_to_a);
    }

    renderPane(els.paneB(), "Human B → Bot (inbox_to_bot)", bBuckets.b_inbox_to_bot);
    const paneB = els.paneB();
    if (paneB) {
      paneB.innerHTML += `<hr class="sep" />`;
      renderAppend(paneB, "Bot → B (bot_to_user)", bBuckets.bot_to_b.length ? bBuckets.bot_to_b : aBuckets.bot_to_b);
    }

    setStatus("Feeds updated.", "ok");
  } catch (err) {
    console.error(err);
    setStatus(`Refresh failed — ${err.message}`, "err");
  }
}

function renderAppend(container, label, items) {
  const block = document.createElement("div");
  block.innerHTML = [
    `<div class="paneHeader">${label}</div>`,
    ...(items || []).map(m => {
      const meta = [
        m.audience,
        m.recipient_profile_id ? `to:${m.recipient_profile_id}` : "",
        m.created_by ? `by:${m.created_by}` : "",
        fmtTime(m.created_at),
      ].filter(Boolean).join(" · ");
      return `
        <div class="msg">
          <div class="content">${escapeHTML(m.content || "")}</div>
          <div class="meta">${meta}</div>
        </div>
      `;
    })
  ].join("\n");
  container.appendChild(block);
}

async function send(userId, textarea) {
  const content = (textarea.value || "").trim();
  if (!content) return;
  try {
    setStatus(`Sending as ${userId.slice(0, 6)}…`);
    await fetchJSON(`${CONFIG.baseURL}/api/send_message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread_id: CONFIG.threadId,
        user_id: userId,
        content,
      }),
    });
    textarea.value = "";
    setStatus("Sent.", "ok");
    await refreshBoth();
  } catch (err) {
    console.error(err);
    setStatus(`Send failed — ${err.message}`, "err");
  }
}

async function processBotQueue() {
  if (!CONFIG.threadId) {
    setStatus("Missing Thread ID.", "warn");
    return;
  }
  if (!CONFIG.botId) {
    setStatus("Process failed — Missing botId (set it and Save).", "err");
    return;
  }
  try {
    setStatus("Processing bot queue…");
    const res = await fetchJSON(`${CONFIG.baseURL}/bot/process?thread_id=${encodeURIComponent(CONFIG.threadId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": CONFIG.botId, // ← REQUIRED header
      },
      body: "{}", // tiny body keeps some proxies happy
    });
    setStatus(`Processed: ${res?.stats?.processed ?? 0}, inserted: ${res?.stats?.inserted ?? 0}`, "ok");
    await refreshBoth();
  } catch (err) {
    console.error(err);
    setStatus(`Process failed — ${err.message}`, "err");
  }
}

function togglePolling() {
  polling = !polling;
  els.poll().textContent = polling ? "Stop Polling" : "Start Polling";
  if (polling) {
    const tick = async () => {
      await refreshBoth().catch(() => {});
      if (polling) pollTimer = setTimeout(tick, 2000);
    };
    tick();
  } else {
    if (pollTimer) clearTimeout(pollTimer);
  }
}

/* wire up */
window.addEventListener("DOMContentLoaded", () => {
  loadFromStorage();

  els.saveBtn()?.addEventListener("click", saveToStorage);
  els.refresh()?.addEventListener("click", refreshBoth);
  els.poll()?.addEventListener("click", togglePolling);
  els.process()?.addEventListener("click", processBotQueue);

  els.sendA()?.addEventListener("click", () => send(CONFIG.profileA, els.inputA()));
  els.sendB()?.addEventListener("click", () => send(CONFIG.profileB, els.inputB()));

  // first paint
  refreshBoth().catch(() => {});
});