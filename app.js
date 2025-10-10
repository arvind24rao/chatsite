// app.js — self-contained demo panel (no dependency on page IDs)

(() => {
  const LSKEY = "loopdemo";

  // ---------- helpers ----------
  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "style" && typeof v === "object") Object.assign(n.style, v);
      else if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    });
    children.forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  };
  const fmt = s => (s || "").trim();
  const save = cfg => localStorage.setItem(LSKEY, JSON.stringify(cfg));
  const load = () => {
    try { return JSON.parse(localStorage.getItem(LSKEY) || "{}"); }
    catch { return {}; }
  };
  const fetchJSON = async (url, opts = {}) => {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return r.json();
  };

  // ---------- UI (shadow dom) ----------
  const host = el("div", { id: "loopdemo-root" });
  const shadow = host.attachShadow({ mode: "open" });
  const css = `
  :host { all: initial; }
  .panel {
    position: fixed; right: 16px; bottom: 16px; width: 420px;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif;
    color: #111; background: #fff; border: 1px solid #ddd; border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0,0,0,.15); overflow: hidden; z-index: 999999;
  }
  .hdr { background:#111; color:#fff; padding:10px 12px; font-weight:600; display:flex; align-items:center; justify-content:space-between;}
  .row { display:flex; gap:8px; margin:8px 0; }
  .col { flex:1; }
  .body { padding:10px 12px; }
  input, textarea { width:100%; padding:8px; border:1px solid #ccc; border-radius:8px; }
  textarea { min-height:60px; resize: vertical; }
  button { padding:8px 10px; border:1px solid #ccc; border-radius:8px; background:#f7f7f7; cursor:pointer; }
  button.primary { background:#111; color:#fff; border-color:#111; }
  .status { margin-top:6px; font-size:12px; color:#444; min-height:18px }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .pane { border:1px solid #eee; border-radius:8px; padding:8px; min-height:110px; background:#fafafa; overflow:auto; max-height:220px;}
  .pane h4 { margin:0 0 6px 0; font-size:12px; color:#555; font-weight:600; }
  .msg { padding:6px 6px; border-radius:6px; background:#fff; border:1px solid #eee; margin-bottom:6px; }
  .meta { font-size:11px; color:#777; margin-top:3px; }
  `;
  const style = el("style", {}, [css]);

  // fields
  const fBase = el("input", { placeholder: "Base URL (default https://api.loopasync.com)" });
  const fThread = el("input", { placeholder: "Thread ID" });
  const fA = el("input", { placeholder: "Profile A ID" });
  const fB = el("input", { placeholder: "Profile B ID" });
  const fBot = el("input", { placeholder: "Bot Profile ID" });
  const tA = el("textarea", { placeholder: "Message from A" });
  const tB = el("textarea", { placeholder: "Message from B" });

  // buttons
  const bSave = el("button", {}, ["Save IDs"]);
  const bRefresh = el("button", {}, ["Refresh"]);
  const bPoll = el("button", {}, ["Start Polling"]);
  const bProcess = el("button", { class: "primary" }, ["Process Bot Queue"]);
  const bSendA = el("button", {}, ["Send (A)"]);
  const bSendB = el("button", {}, ["Send (B)"]);

  // panes
  const paneA = el("div", { class: "pane" }, [el("h4", {}, ["A → Bot, then Bot → A"])]);
  const paneB = el("div", { class: "pane" }, [el("h4", {}, ["B → Bot, then Bot → B"])]);
  const status = el("div", { class: "status" });

  const hdr = el("div", { class: "hdr" }, [
    el("div", {}, ["Loop Demo Controls"]),
    el("button", { title: "Close", style: { background: "#fff", color: "#111" } }, ["×"])
  ]);
  hdr.lastChild.addEventListener("click", () => host.remove());

  const body = el("div", { class: "body" }, [
    el("div", { class: "row" }, [fBase]),
    el("div", { class: "row" }, [fThread]),
    el("div", { class: "row" }, [fA, fB]),
    el("div", { class: "row" }, [fBot]),
    el("div", { class: "row" }, [tA]),
    el("div", { class: "row" }, [tB]),
    el("div", { class: "row" }, [bSave, bRefresh, bProcess]),
    el("div", { class: "row" }, [bSendA, bSendB, bPoll]),
    el("div", { class: "grid" }, [paneA, paneB]),
    status
  ]);

  const panel = el("div", { class: "panel" }, [hdr, body]);
  shadow.appendChild(style);
  shadow.appendChild(panel);
  document.documentElement.appendChild(host);

  // ---------- state ----------
  let polling = false;
  let pollTimer = null;

  const getBase = () => fmt(fBase.value) || "https://api.loopasync.com";
  const cfg = () => ({
    baseURL: getBase(),
    threadId: fmt(fThread.value),
    profileA: fmt(fA.value),
    profileB: fmt(fB.value),
    botId: fmt(fBot.value),
  });

  // load saved
  const saved = load();
  fBase.value = saved.baseURL || "https://api.loopasync.com";
  fThread.value = saved.threadId || "";
  fA.value = saved.profileA || "";
  fB.value = saved.profileB || "";
  fBot.value = saved.botId || "";

  const setStatus = (msg, kind = "info") => {
    status.textContent = msg;
    status.style.color = kind === "err" ? "#c00" : kind === "ok" ? "#0a0" : "#444";
  };

  const renderPane = (paneEl, label, items) => {
    paneEl.innerHTML = "";
    paneEl.appendChild(el("h4", {}, [label]));
    (items || []).forEach(m => {
      const metaBits = [
        m.audience,
        m.recipient_profile_id ? `to:${m.recipient_profile_id}` : "",
        m.created_by ? `by:${m.created_by}` : "",
        m.created_at
      ].filter(Boolean).join(" · ");
      paneEl.appendChild(el("div", { class: "msg" }, [
        el("div", {}, [m.content || ""]),
        el("div", { class: "meta" }, [metaBits])
      ]));
    });
  };

  const splitBuckets = (all, aId, bId) => {
    const eq = (x, y) => (x || "").toLowerCase() === (y || "").toLowerCase();
    const byTime = (x, y) => (y.created_at || "").localeCompare(x.created_at || "");
    const a_in = all.filter(m => m.audience === "inbox_to_bot" && eq(m.created_by, aId)).sort(byTime);
    const b_in = all.filter(m => m.audience === "inbox_to_bot" && eq(m.created_by, bId)).sort(byTime);
    const bot_a = all.filter(m => m.audience === "bot_to_user" && eq(m.recipient_profile_id, aId)).sort(byTime);
    const bot_b = all.filter(m => m.audience === "bot_to_user" && eq(m.recipient_profile_id, bId)).sort(byTime);
    return { a_in, b_in, bot_a, bot_b };
  };

  const refresh = async () => {
    const { baseURL, threadId, profileA, profileB } = cfg();
    if (!threadId || !profileA || !profileB) {
      setStatus("Fill Thread ID, Profile A, Profile B first.", "warn");
      return;
    }
    try {
      setStatus("Loading…");
      const [aView, bView] = await Promise.all([
        fetchJSON(`${baseURL}/api/get_messages?thread_id=${encodeURIComponent(threadId)}&user_id=${encodeURIComponent(profileA)}&limit=200`),
        fetchJSON(`${baseURL}/api/get_messages?thread_id=${encodeURIComponent(threadId)}&user_id=${encodeURIComponent(profileB)}&limit=200`)
      ]);
      const A = splitBuckets(aView.items || [], profileA, profileB);
      const B = splitBuckets(bView.items || [], profileA, profileB);
      renderPane(paneA, "A → Bot (inbox_to_bot) · Bot → A", [...A.a_in, ...A.bot_a]);
      renderPane(paneB, "B → Bot (inbox_to_bot) · Bot → B", [...B.b_in, ...B.bot_b]);
      setStatus("Feeds updated.", "ok");
    } catch (e) {
      console.error(e);
      setStatus(`Refresh failed — ${e.message}`, "err");
    }
  };

  const sendMsg = async (who) => {
    const { baseURL, threadId, profileA, profileB } = cfg();
    const content = who === "A" ? fmt(tA.value) : fmt(tB.value);
    const userId = who === "A" ? profileA : profileB;
    if (!threadId || !userId || !content) return setStatus("Missing thread/user/content.", "warn");
    await fetchJSON(`${baseURL}/api/send_message`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, user_id: userId, content })
    });
    if (who === "A") tA.value = ""; else tB.value = "";
    setStatus(`Sent (${who}).`, "ok");
    await refresh();
  };

  const processBot = async () => {
    const { baseURL, threadId, botId } = cfg();
    if (!threadId || !botId) return setStatus("Missing threadId or botId.", "warn");
    const res = await fetchJSON(`${baseURL}/bot/process?thread_id=${encodeURIComponent(threadId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": botId },
      body: "{}"
    });
    setStatus(`Processed ${res?.stats?.processed ?? 0}, inserted ${res?.stats?.inserted ?? 0}.`, "ok");
    await refresh();
  };

  const togglePoll = async () => {
    polling = !polling;
    bPoll.textContent = polling ? "Stop Polling" : "Start Polling";
    const tick = async () => {
      if (!polling) return;
      await refresh().catch(() => {});
      pollTimer = setTimeout(tick, 2000);
    };
    if (polling) tick(); else if (pollTimer) clearTimeout(pollTimer);
  };

  // ---------- wire ----------
  bSave.addEventListener("click", () => { save(cfg()); setStatus("Saved.", "ok"); });
  bRefresh.addEventListener("click", refresh);
  bProcess.addEventListener("click", processBot);
  bSendA.addEventListener("click", () => sendMsg("A"));
  bSendB.addEventListener("click", () => sendMsg("B"));
  bPoll.addEventListener("click", togglePoll);

  // first paint
  refresh().catch(() => {});
})();