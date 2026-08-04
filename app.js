/* ============================================================
   ctrl+alt+identity — app
   ============================================================ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };
  const isMobile = () => window.innerWidth < 720;

  /* ---------- desktop items ---------- */
  const ITEMS = [
    { id: "about",    label: "About Me",    icon: "about",    title: "About Me" },
    { id: "posts",    label: "Blog Posts",  icon: "ie",       title: "ctrl+alt+identity - Internet Explorer" },
    { id: "linkedin", label: "LinkedIn",    icon: "linkedin", title: "LinkedIn - Internet Explorer" },
    { id: "contact",  label: "Contact Me",  icon: "contact",  title: "Contact Me" },
    { id: "projects", label: "Other Projects", icon: "projects", title: "Other Projects" },
    { id: "cube",     label: "SailPoint", icon: "sailpoint", title: "SailPoint IdentityIQ", col: 2 },
    { id: "ad",       label: "Active Directory", icon: "ad", title: "Active Directory Users and Computers", col: 2 },
    { id: "computer", label: "My Computer", icon: "computer", title: "My Computer" },
  ];
  const EXTRA = { taskmgr: { icon: "taskmgr", title: "Windows Task Manager" } };

  let POSTS = [];

  /* ============================================================
     Minimal markdown renderer
     ============================================================ */
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  }

  function markdown(src) {
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let para = [], list = null, fence = null;

    const flushPara = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
    const flushList = () => { if (list) { out.push("<ul>" + list.join("") + "</ul>"); list = null; } };
    const flushAll = () => { flushPara(); flushList(); };

    for (const raw of lines) {
      const line = raw.trimEnd();

      if (line.startsWith("```")) {
        if (fence === null) { flushAll(); fence = []; }
        else { out.push("<pre><code>" + esc(fence.join("\n")) + "</code></pre>"); fence = null; }
        continue;
      }
      if (fence !== null) { fence.push(raw); continue; }

      if (!line.trim()) { flushAll(); continue; }

      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { flushAll(); const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue; }

      const li = line.match(/^[-*]\s+(.*)$/);
      if (li) { flushPara(); (list = list || []).push("<li>" + inline(li[1]) + "</li>"); continue; }

      flushList();
      para.push(line.trim());
    }
    if (fence !== null) out.push("<pre><code>" + esc(fence.join("\n")) + "</code></pre>");
    flushAll();
    return out.join("\n");
  }

  /* ============================================================
     Window manager
     ============================================================ */
  /* ============================================================
     Hash routing — so posts can be linked to and shared
     ============================================================ */
  const ROUTE_WINDOWS = { blog: "posts", about: "about", contact: "contact",
                          projects: "projects", linkedin: "linkedin", computer: "computer" };
  let suppressHash = false;

  function setRoute(hash) {
    if (location.hash === hash) return;
    suppressHash = true;
    history.replaceState(null, "", hash || location.pathname);
    setTimeout(() => (suppressHash = false), 0);
  }

  function slugOf(file) { return file.replace(/\.md$/, ""); }

  async function applyRoute() {
    const h = location.hash.replace(/^#\/?/, "");
    if (!h) return false;
    const m = h.match(/^posts\/(.+)$/);
    if (m) {
      if (postsReady) await postsReady;
      const p = POSTS.find((x) => slugOf(x.file) === m[1]);
      if (p) { openWindow("posts", { post: p }); return true; }
      openWindow("posts");
      return true;
    }
    const w = ROUTE_WINDOWS[h];
    if (w) { openWindow(w); return true; }
    return false;
  }

  const NO_CHROME = new Set(["cube", "ad", "posts", "linkedin", "control", "search"]);

  const sessionStart = Date.now();
  const sessionMins = () => Math.max(1, Math.round((Date.now() - sessionStart) / 60000));

  const wins = new Map();
  let zTop = 100, seq = 0;

  /* ============================================================
     Sound — lazily loaded, off until the visitor opts in
     ============================================================ */
  const SOUNDS = {
    startup: "startup.mp3",
    balloon: "balloon.mp3",
    error: "error.mp3",
    start: "start.mp3",
    open: "open.mp3",
    minimize: "minimize.mp3",
    restore: "restore.mp3",
    shutdown: "shutdown.mp3",
    logoff: "logoff.mp3",
    ding: "ding.mp3",
  };
  const audioCache = {};
  const SOUND_KEY = "cai-sound";
  const CRT_KEY = "cai-crt";
  // on by default: the chime fires on the login tap, which is a deliberate user action.
  // a visitor who mutes is remembered, so it never nags on a repeat visit.
  let soundOn = true;
  try {
    const saved = localStorage.getItem(SOUND_KEY);
    if (saved !== null) soundOn = saved === "1";
  } catch (e) { /* private mode, stay with the default */ }

  let primed = false;

  // Played through the Web Audio API rather than <audio> elements. iOS treats any
  // playing HTMLAudioElement as a real media session and puts it on the lock screen
  // ("Now Playing", with your page title as the label) even for a one-second click
  // sound. AudioContext + AudioBufferSourceNode plays the same files without ever
  // registering as a system media session, so nothing reaches the lock screen.
  let audioCtx = null;

  function getCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  async function decodeSound(name) {
    const ctx = getCtx();
    if (!ctx) return null;
    const res = await fetch("assets/sounds/" + SOUNDS[name]);
    const buf = await res.arrayBuffer();
    return new Promise((resolve, reject) => {
      // decodeAudioData has both a promise and legacy callback form; the callback
      // form is what old Safari needs, so cover both.
      const p = ctx.decodeAudioData(buf, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  // Fetch and decode every clip up front, on the first real user gesture (the login
  // tap), so nothing lags on its first play later.
  function primeAudio() {
    if (primed) return;
    primed = true;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    Object.keys(SOUNDS).forEach((name) => {
      decodeSound(name).then((buf) => { audioCache[name] = buf; }).catch(() => {});
    });
  }

  function play(name) {
    if (!soundOn || !SOUNDS[name]) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") ctx.resume();
      const fire = (buf) => {
        if (!buf) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      };
      if (audioCache[name]) fire(audioCache[name]);
      else decodeSound(name).then((buf) => { audioCache[name] = buf; fire(buf); }).catch(() => {});
    } catch (e) { /* audio is a nicety, never a failure */ }
  }

  let crtOn = true;
  try {
    const c = localStorage.getItem(CRT_KEY);
    if (c !== null) crtOn = c === "1";
  } catch (e) {}

  function setCrt(on, remember) {
    crtOn = on;
    document.querySelector(".crt").classList.toggle("hidden", !on);
    if (remember) { try { localStorage.setItem(CRT_KEY, on ? "1" : "0"); } catch (e) {} }
  }

  function setSound(on, remember) {
    soundOn = on;
    if (remember) {
      try { localStorage.setItem(SOUND_KEY, on ? "1" : "0"); } catch (e) {}
    }
    document.querySelectorAll(".soundbtn").forEach((b) => {
      b.textContent = on ? "🔊" : "🔇";
      b.setAttribute("aria-label", on ? "Mute sounds" : "Unmute sounds");
      b.classList.toggle("on", on);
    });
  }

  function focusWin(id) {
    const w = wins.get(id);
    if (!w) return;
    // z climbs on every focus; rebase before it can reach the taskbar (400)
    if (zTop > 300) {
      [...wins.values()]
        .sort((a, b) => (+a.node.style.zIndex || 0) - (+b.node.style.zIndex || 0))
        .forEach((v, i) => (v.node.style.zIndex = 100 + i));
      zTop = 100 + wins.size;
    }
    w.node.style.zIndex = ++zTop;
    w.min = false;
    w.node.classList.remove("hidden");
    for (const [k, v] of wins) v.node.classList.toggle("idle", k !== id);
    renderTasks();
  }

  function closeWin(id) {
    const w = wins.get(id);
    if (!w) return;
    w.node.remove();
    wins.delete(id);
    const last = [...wins.keys()].pop();
    if (last) focusWin(last); else { renderTasks(); setRoute(""); }
  }

  function minimizeWin(id) {
    const w = wins.get(id);
    if (!w) return;
    play("minimize");
    w.min = true;
    w.node.classList.add("hidden");
    renderTasks();
  }

  function toggleMax(id) {
    const w = wins.get(id);
    if (!w || isMobile()) return;
    w.max = !w.max;
    const n = w.node;
    if (w.max) {
      w.prev = { left: n.style.left, top: n.style.top, width: n.style.width, height: n.style.height };
      Object.assign(n.style, { left: "0px", top: "0px", width: "100%", height: `calc(100% - var(--taskbar-h))` });
    } else Object.assign(n.style, w.prev);
  }

  function makeDraggable(node, bar, id) {
    let sx, sy, ox, oy, on = false;
    const down = (e) => {
      if (isMobile() || wins.get(id)?.max) return;
      if (e.target.closest("button")) return;
      const p = e.touches ? e.touches[0] : e;
      on = true; sx = p.clientX; sy = p.clientY;
      ox = node.offsetLeft; oy = node.offsetTop;
      focusWin(id);
    };
    const move = (e) => {
      if (!on) return;
      const p = e.touches ? e.touches[0] : e;
      node.style.left = ox + (p.clientX - sx) + "px";
      node.style.top = Math.max(0, oy + (p.clientY - sy)) + "px";
      e.preventDefault();
    };
    const up = () => { on = false; };
    bar.addEventListener("mousedown", down);
    bar.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
  }

  function openWindow(key, opts) {
    opts = opts || {};
    const id = opts.uid || key;
    if (wins.has(id)) { focusWin(id); return; }

    const meta = ITEMS.find((i) => i.id === key) || EXTRA[key] || {};
    const title = opts.title || meta.title || key;
    const icon = opts.icon || meta.icon || "notepad";

    const node = el("div", "win");
    const n = wins.size;
    Object.assign(node.style, {
      left: 48 + n * 26 + "px",
      top: 34 + n * 24 + "px",
      width: (opts.w || 560) + "px",
      height: (opts.h || 440) + "px",
      zIndex: ++zTop,
    });

    const bar = el("div", "titlebar");
    bar.innerHTML =
      `<img src="assets/icons/${icon}.svg" alt="">` +
      `<span class="t"></span>` +
      `<button class="min" aria-label="Minimize">_</button>` +
      `<button class="max" aria-label="Maximize">□</button>` +
      `<button class="close" aria-label="Close">✕</button>`;
    bar.querySelector(".t").textContent = title;

    const body = el("div", "winbody");
    body.innerHTML = "<div class='doc'><p>Loading…</p></div>";

    const chromed = !NO_CHROME.has(key);
    let chrome = null, status = null;
    if (chromed) {
      chrome = el("div", "xpchrome");
      chrome.innerHTML =
        `<div class="xpmenu">
           <span data-m="File">File</span><span data-m="View">View</span><span class="dim">Help</span>
           <img class="xpflag" src="assets/xp-logo.png" alt="">
         </div>
         <div class="xpmenudrop hidden"></div>
         <div class="xptool">
           <button data-act="close"><span class="tclose">&#10005;</span>Close</button>
           <i class="tsep"></i>
           <button data-act="about"><img src="assets/icons/about.svg" alt="">About Me</button>
           <button data-act="contact"><img src="assets/icons/contact.svg" alt="">Contact</button>
           <button data-act="projects"><img src="assets/icons/projects.svg" alt="">Other Projects</button>
           <button data-act="computer"><img src="assets/icons/computer.svg" alt="">My Computer</button>
         </div>
         <div class="xpaddr">
           <label>Address</label>
           <div class="xpfield"><img src="assets/icons/${icon}.svg" alt=""><span></span><b>&#9662;</b></div>
           <button class="xpgo">&#8594; Go</button>
         </div>`;
      chrome.querySelector(".xpfield span").textContent = title;
      status = el("div", "xpstatus");
      status.textContent = "Ready";
    }

    node.append(bar);
    if (chrome) node.append(chrome);
    node.append(body);
    if (status) node.append(status);
    $("#windows").appendChild(node);
    wins.set(id, { node, title, icon, min: false, max: false });

    if (chrome) {
      const mdrop = chrome.querySelector(".xpmenudrop");
      const closeM = () => {
        mdrop.classList.add("hidden");
        chrome.querySelectorAll(".xpmenu span").forEach((s) => s.classList.remove("on"));
      };
      chrome.querySelectorAll(".xpmenu span[data-m]").forEach((s) => {
        s.onclick = (e) => {
          e.stopPropagation();
          if (s.classList.contains("on")) return closeM();
          closeM();
          s.classList.add("on");
          const items = s.dataset.m === "File"
            ? [["Close", () => closeWin(id)]]
            : [["Refresh", () => fillWindow(key, body, opts)]];
          mdrop.innerHTML = items.map(([l], i) => `<button data-i="${i}">${l}</button>`).join("");
          mdrop.style.left = s.offsetLeft + "px";
          mdrop.classList.remove("hidden");
          mdrop.querySelectorAll("button").forEach((b) => (b.onclick = (ev) => {
            ev.stopPropagation();
            closeM();
            items[+b.dataset.i][1]();
          }));
        };
      });
      chrome.onclick = () => closeM();
      chrome.querySelectorAll(".xptool button").forEach((b) => (b.onclick = (e) => {
        e.stopPropagation();
        const a = b.dataset.act;
        if (a === "close") closeWin(id); else openWindow(a);
      }));
      chrome.querySelector(".xpgo").onclick = (e) => { e.stopPropagation(); fillWindow(key, body, opts); };
    }

    bar.querySelector(".min").onclick = () => minimizeWin(id);
    bar.querySelector(".max").onclick = () => toggleMax(id);
    bar.querySelector(".close").onclick = () => closeWin(id);
    bar.ondblclick = () => toggleMax(id);
    node.addEventListener("mousedown", () => focusWin(id));
    makeDraggable(node, bar, id);

    play(key === "taskmgr" ? "error" : "open");
    const rk = Object.keys(ROUTE_WINDOWS).find((k) => ROUTE_WINDOWS[k] === key);
    if (rk && key !== "posts") setRoute("#/" + rk);
    focusWin(id);
    fillWindow(key, body, opts);
  }

  function renderTasks() {
    const box = $("#tasks");
    box.innerHTML = "";
    const topZ = Math.max(0, ...[...wins.values()].filter((w) => !w.min).map((w) => +w.node.style.zIndex));
    for (const [id, w] of wins) {
      const b = el("button", "taskbtn");
      b.textContent = w.title;
      if (!w.min && +w.node.style.zIndex === topZ) b.classList.add("on");
      b.onclick = () => {
        if (w.min || +w.node.style.zIndex !== topZ) { if (w.min) play("restore"); focusWin(id); }
        else minimizeWin(id);
      };
      box.appendChild(b);
    }
  }

  /* ============================================================
     Window content
     ============================================================ */
  async function fillWindow(key, body, opts) {
    if (key === "cube") return renderSailPoint(body);
    if (key === "ad")   return renderAD(body);
    if (key === "posts" || key === "linkedin") return renderBrowser(body, { ...opts, start: key });
    if (key === "control") return renderControlPanel(body);
    if (key === "search") return renderSearch(body);

    if (key === "computer") {
      body.innerHTML = `<div class="doc">
        <h1>My Computer</h1>
        <div class="meta">System summary</div>
        <p><strong>Operating system</strong><br>ctrl+alt+identity, Identity Edition</p>
        <p><strong>Registered to</strong><br>Luke Laverton<br>Senior Technical Specialist, Identity &amp; Access Management</p>
        <p><strong>Uptime</strong><br>Provisioning since 2015</p>
      </div>`;
      return;
    }

    if (key === "taskmgr") {
      const rows = [
        ["identityiq.exe", "Running", "412,880 K"],
        ["entra-conditional-access.exe", "Running", "88,120 K"],
        ["pim-eligible-role.exe", "Awaiting approval", "4,096 K"],
        ["access-review.exe", "Not responding", "1,204,992 K"],
        ["orphaned-account.exe", "Unknown", "16 K"],
        ["joiner-mover-leaver.exe", "Running", "231,004 K"],
      ];
      body.innerHTML = `<div style="padding:10px">
        <table class="iiq-grid">
          <tr><th>Image Name</th><th>Status</th><th>Mem Usage</th></tr>
          ${rows.map((r) =>
            `<tr><td>${r[0]}</td><td class="${r[1] === "Not responding" ? "warn" : ""}">${r[1]}</td><td>${r[2]}</td></tr>`
          ).join("")}
        </table>
        <p style="font-size:11px;color:#5a6673;margin-top:10px">Processes: 6</p>
      </div>`;
      return;
    }

    const files = { about: "about.md", contact: "contact.md", projects: "projects.md" };
    if (files[key]) {
      try {
        const md = await fetch("posts/" + files[key]).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.text();
        });
        body.innerHTML = `<div class="doc">${markdown(md)}</div>`;
      } catch (e) {
        body.innerHTML = `<div class="doc"><p>Couldn't load <code>posts/${files[key]}</code>.</p></div>`;
      }
    }
  }

  /* ============================================================
     SailPoint IdentityIQ — a small navigable app
     ============================================================ */
  const IIQ_MENUS = {
    "My Work": ["My Access Reviews", "Access Requests", "Policy Violations", "Work Items"],
    "Identities": ["Identity Warehouse", "Identity Access History", "Identity Correlation", "Identity Risk Model", "Identity Operations"],
    "Applications": ["Application Definition", "Rapid Setup", "Entitlement Catalog", "Application Risk Model", "Activity Target Categories"],
    "Intelligence": ["Advanced Analytics", "Reports", "Identity Risk Scores", "Application Risk Scores"],
    "Setup": ["Certifications", "Roles", "Policies", "Alerts", "Tasks", "Groups", "Business Processes", "Lifecycle Events", "Batch Requests"],
  };

  async function renderSailPoint(body) {
    let d;
    try {
      d = await fetch("data/sailpoint.json").then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
    } catch (e) {
      body.innerHTML = '<div class="doc"><p>Couldn\'t load <code>data/sailpoint.json</code>.</p></div>';
      return;
    }

    const now = new Date();
    const stamp = (mins) =>
      new Date(now - mins * 60000).toLocaleString("en-GB",
        { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const refresh = stamp(0);

    let view = { name: "home" };
    let openMenu = null;

    const menuBar = Object.keys(IIQ_MENUS)
      .map((m) => `<span class="iiq-menu" data-menu="${m}">${m} <i>&#9662;</i></span>`).join("");

    body.innerHTML = `<div class="iiq">
      <div class="iiq-brand"><img src="assets/icons/sailpoint.svg" alt=""><span>SailPoint</span></div>
      <div class="iiq-nav">
        <span class="iiq-menu" data-menu="Home">Home</span>${menuBar}
      </div>
      <div class="iiq-drop hidden"></div>
      <div class="iiq-body"></div>
    </div>`;

    const pane = body.querySelector(".iiq-body");
    const drop = body.querySelector(".iiq-drop");

    /* ---- views ---- */
    function home() {
      const cards = d.stats
        .map(([l, v]) => `<div class="iiq-card"><a>${l} <b>&rsaquo;</b></a><strong>${v}</strong></div>`)
        .join("") +
        `<div class="iiq-card link"><a>Manage User Access <b>&rsaquo;</b></a></div>
         <div class="iiq-card link"><a>Track My Requests <b>&rsaquo;</b></a></div>`;
      const panels = ["Latest Violation Work Items", "My Access Reviews", "Certification Campaigns"]
        .map((t) => `<div class="iiq-panel"><header>${t}</header><div class="iiq-nodata">Currently no data</div></div>`)
        .join("");
      pane.innerHTML = `<h1><span class="ico">&#8962;</span> Home</h1>
        <div class="iiq-cards">${cards}</div>
        <div class="iiq-panels">${panels}</div>`;
    }

    function warehouse() {
      const rows = d.identities.map((i, n) => `
        <tr data-i="${n}">
          <td><a>${i.userName}</a></td><td>${i.firstName}</td><td>${i.lastName}</td>
          <td>${i.manager}</td><td class="wrap">${i.assigned || ""}</td>
          <td class="wrap">${i.detected || ""}</td>
          <td><span class="risk">&#9679;</span>${i.risk}</td>
          <td>${refresh}</td><td>${i.type}</td>
        </tr>`).join("");
      pane.innerHTML = `<h1>Identity Warehouse</h1>
        <div class="iiq-filter"><input placeholder="Filter by Identity Name"><button>&#9906;</button></div>
        <div class="iiq-scroll"><table class="iiq-grid warehouse">
          <tr><th>User Name</th><th>First Name</th><th>Last Name</th><th>Manager</th>
              <th>Assigned Role Summary</th><th>Detected Role Summary</th>
              <th>Risk Score</th><th>Last Refresh</th><th>Type</th></tr>
          ${rows}
        </table></div>
        <p class="iiq-count">Displaying 1 to ${d.identities.length} of ${d.identities.length}</p>`;

      const input = pane.querySelector("input");
      input.oninput = () => {
        const q = input.value.toLowerCase();
        pane.querySelectorAll("tr[data-i]").forEach((tr) => {
          const i = d.identities[+tr.dataset.i];
          const hit = (i.userName + i.firstName + i.lastName).toLowerCase().includes(q);
          tr.classList.toggle("hidden", !hit);
        });
      };
      pane.querySelectorAll("tr[data-i]").forEach((tr) =>
        (tr.onclick = () => go({ name: "identity", i: +tr.dataset.i })));
    }

    function identity(n) {
      const i = d.identities[n];
      const attrs = [
        ["User Name", i.userName], ["First Name", i.firstName], ["Last Name", i.lastName],
        ["Email", i.email || "&mdash;"], ["Manager", i.manager, d.identities.some((q) => q.userName === i.manager)], ["Department", i.department],
        ["Location", i.location], ["Job Title", i.jobTitle], ["Cost Center", i.costCenter],
        ["Status", i.status],
      ].map(([k, v, link]) =>
        `<tr><th>${k}</th><td>${link ? `<a data-mgr="${v}">${v}</a>` : v}</td></tr>`).join("");

      const ents = i.entitlements.length
        ? i.entitlements.map(([n2, app, t, src], x) =>
            `<tr><td>${n2}</td><td>${app}</td><td>${t}</td><td>${src}</td><td>${stamp(x)}</td></tr>`).join("")
        : `<tr><td colspan="5" class="none">Currently no data</td></tr>`;

      const accts = i.accounts.map(([app, id, st, en]) =>
        `<tr><td>${app}</td><td>${id}</td><td>${st}</td><td>${en}</td><td>${refresh}</td></tr>`).join("");

      const hist = i.history.map(([e, src], x) =>
        `<tr><td>${stamp(x * 3)}</td><td>${e}</td><td>${src}</td></tr>`).join("");

      pane.innerHTML = `
        <p class="iiq-crumb"><a data-back>Identity Warehouse</a> &rsaquo; ${i.userName}</p>
        <h1>View Identity ${i.userName}</h1>
        <div class="iiq-tabs">
          <button class="on" data-tab="a">Attributes</button>
          <button data-tab="e">Entitlements</button>
          <button data-tab="c">Application Accounts</button>
          <button data-tab="p">Policy</button>
          <button data-tab="h">History</button>
        </div>
        <div class="iiq-pane" data-pane="a"><table class="iiq-attr">${attrs}</table></div>
        <div class="iiq-pane hidden" data-pane="e"><div class="iiq-scroll"><table class="iiq-grid">
          <tr><th>Name</th><th>Application</th><th>Type</th><th>Source</th><th>Assigned</th></tr>${ents}
        </table></div></div>
        <div class="iiq-pane hidden" data-pane="c"><div class="iiq-scroll"><table class="iiq-grid">
          <tr><th>Application</th><th>Account ID</th><th>Status</th><th>Enabled</th><th>Last Refresh</th></tr>${accts}
        </table></div></div>
        <div class="iiq-pane hidden" data-pane="p"><p class="iiq-nodata plain">No policy violations.</p></div>
        <div class="iiq-pane hidden" data-pane="h"><div class="iiq-scroll"><table class="iiq-grid">
          <tr><th>Date</th><th>Event</th><th>Source</th></tr>${hist}
        </table></div></div>`;

      const tabs = pane.querySelectorAll(".iiq-tabs button");
      tabs.forEach((t) => (t.onclick = () => {
        tabs.forEach((x) => x.classList.toggle("on", x === t));
        pane.querySelectorAll(".iiq-pane").forEach((p) =>
          p.classList.toggle("hidden", p.dataset.pane !== t.dataset.tab));
      }));
      pane.querySelector("[data-back]").onclick = () => go({ name: "warehouse" });
      const mgr = pane.querySelector("[data-mgr]");
      if (mgr) mgr.onclick = () => {
        const x = d.identities.findIndex((q) => q.userName === mgr.dataset.mgr);
        if (x > -1) go({ name: "identity", i: x });
      };
    }

    function blank(title) {
      pane.innerHTML = `<h1>${title}</h1>
        <div class="iiq-panel"><header>${title}</header>
        <div class="iiq-nodata">Currently no data</div></div>`;
    }

    /* ---- routing ---- */
    function go(v) {
      view = v;
      closeMenu();
      if (v.name === "home") return home();
      if (v.name === "warehouse") return warehouse();
      if (v.name === "identity") return identity(v.i);
      blank(v.title);
    }

    function closeMenu() {
      openMenu = null;
      drop.classList.add("hidden");
      body.querySelectorAll(".iiq-menu").forEach((m) => m.classList.remove("on"));
    }

    const iiqRoot = body.querySelector(".iiq");
    const iiqNav = body.querySelector(".iiq-nav");
    // the nav bar scrolls horizontally on a phone; if it scrolls while a dropdown
    // is open the dropdown would be left pointing at wherever the button used to
    // be, so just close it rather than try to track a moving target.
    iiqNav.addEventListener("scroll", closeMenu);

    body.querySelectorAll(".iiq-menu").forEach((m) => {
      m.onclick = (e) => {
        e.stopPropagation();
        const name = m.dataset.menu;
        if (name === "Home") return go({ name: "home" });
        if (openMenu === name) return closeMenu();
        closeMenu();
        openMenu = name;
        m.classList.add("on");
        drop.innerHTML = IIQ_MENUS[name]
          .map((it) => `<button data-item="${it}">${it}</button>`).join("");
        // position from the actual rendered rect, not offsetLeft -- offsetLeft is
        // relative to the nav's full scrollable width and ignores how far it has
        // been scrolled, which is exactly what put the dropdown in the wrong place.
        const btnRect = m.getBoundingClientRect();
        const rootRect = iiqRoot.getBoundingClientRect();
        const left = Math.max(4, Math.min(btnRect.left - rootRect.left, rootRect.width - 180));
        drop.style.left = left + "px";
        drop.classList.remove("hidden");
        drop.querySelectorAll("button").forEach((b) => (b.onclick = (ev) => {
          ev.stopPropagation();
          const it = b.dataset.item;
          go(it === "Identity Warehouse" ? { name: "warehouse" } : { name: "blank", title: it });
        }));
      };
    });
    body.onclick = () => closeMenu();

    go({ name: "warehouse" });
  }

  /* ============================================================
     Active Directory Users and Computers
     ============================================================ */
  const ADUC_MENUS = {
    File: [["New", 1], ["Delete", 1], ["Rename", 1], ["Refresh", 0], ["Export List...", 1], ["Properties", 1], ["Exit", 0]],
    Action: [["New", 1], ["Find...", 1], ["Delegate Control...", 1], ["Refresh", 0], ["Properties", 1]],
    View: [["Add/Remove Columns...", 1], ["Large Icons", 1], ["Small Icons", 1], ["List", 1], ["Detail", 0], ["Advanced Features", 1]],
    Help: [["Help Topics", 1], ["About Active Directory Users and Computers", 0]],
  };

  async function renderAD(body) {
    let d;
    try {
      d = await fetch("data/directory.json").then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
    } catch (e) {
      body.innerHTML = '<div class="doc"><p>Couldn\'t load <code>data/directory.json</code>.</p></div>';
      return;
    }

    let sel = 3;
    let openMenu = null;

    body.innerHTML = `<div class="aduc">
      <div class="aduc-menu">${Object.keys(ADUC_MENUS)
        .map((m) => `<span data-menu="${m}">${m}</span>`).join("")}</div>
      <div class="aduc-drop hidden"></div>
      <div class="aduc-panes">
        <div class="aduc-tree">
          <div class="aduc-root"><img src="assets/icons/ad.svg" alt="">${d.root}</div>
          <div class="aduc-dom"><img src="assets/icons/ad.svg" alt="">${d.domain}</div>
          <ul>${d.containers.map((c, i) =>
            `<li><button data-c="${i}"><img src="assets/icons/posts.svg" alt="">${c.name}</button></li>`).join("")}</ul>
        </div>
        <div class="aduc-list">
          <table class="aduc-grid">
            <thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      <div class="aduc-status"></div>
      <div class="aduc-modal hidden"></div>
    </div>`;

    const tbody = body.querySelector(".aduc-list tbody");
    const status = body.querySelector(".aduc-status");
    const drop = body.querySelector(".aduc-drop");
    const modal = body.querySelector(".aduc-modal");
    const btns = body.querySelectorAll(".aduc-tree ul button");

    function select(i) {
      sel = i;
      btns.forEach((b) => b.classList.toggle("on", +b.dataset.c === i));
      const c = d.containers[i];
      tbody.innerHTML = c.items.map(([n, t, desc], x) =>
        `<tr data-x="${x}"><td><img src="assets/icons/${t === "group" ? "group" : "about"}.svg" alt="">${n}</td>
           <td>${t === "group" ? "Security Group" : "User"}</td><td>${desc}</td></tr>`).join("");
      status.textContent = c.items.length + " object(s)";
      tbody.querySelectorAll("tr").forEach((tr) => {
        tr.onclick = () => {
          tbody.querySelectorAll("tr").forEach((o) => o.classList.toggle("on", o === tr));
        };
        tr.ondblclick = () => properties(c.items[+tr.dataset.x]);
      });
    }

    function properties([name, type, desc]) {
      const isGroup = type === "group";
      const general = [
        [isGroup ? "Group name" : "User logon name", name],
        ["Type", isGroup ? "Security Group" : "User"],
        ["Scope", isGroup ? "Global" : "Domain"],
        ["Description", desc],
      ].map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("");

      const memberOf = (isGroup
        ? ["Domain Users"]
        : ["Domain Users", "SG-Desktop-Users"]
      ).map((g) => `<tr><td><img src="assets/icons/group.svg" alt="">${g}</td><td>${d.domain}</td></tr>`).join("");

      modal.innerHTML = `<div class="aduc-dlg">
        <div class="aduc-dlg-bar"><span>${name} Properties</span><button class="x">&#10005;</button></div>
        <div class="aduc-dlg-tabs">
          <button class="on" data-t="g">General</button>
          <button data-t="m">Member Of</button>
        </div>
        <div class="aduc-dlg-body">
          <div data-p="g"><table class="aduc-props">${general}</table></div>
          <div data-p="m" class="hidden"><table class="aduc-props list">
            <tr><th>Name</th><th>Active Directory Domain Services Folder</th></tr>${memberOf}
          </table></div>
        </div>
        <div class="aduc-dlg-foot"><button class="ok">OK</button><button class="cancel">Cancel</button></div>
      </div>`;
      modal.classList.remove("hidden");
      play("ding");

      const close = () => modal.classList.add("hidden");
      modal.querySelector(".x").onclick = close;
      modal.querySelector(".ok").onclick = close;
      modal.querySelector(".cancel").onclick = close;
      const tabs = modal.querySelectorAll(".aduc-dlg-tabs button");
      tabs.forEach((t) => (t.onclick = () => {
        tabs.forEach((x) => x.classList.toggle("on", x === t));
        modal.querySelectorAll("[data-p]").forEach((p) =>
          p.classList.toggle("hidden", p.dataset.p !== t.dataset.t));
      }));
    }

    function closeMenu() {
      openMenu = null;
      drop.classList.add("hidden");
      body.querySelectorAll(".aduc-menu span").forEach((s) => s.classList.remove("on"));
    }

    btns.forEach((b) => (b.onclick = (e) => { e.stopPropagation(); closeMenu(); select(+b.dataset.c); }));

    body.querySelectorAll(".aduc-menu span").forEach((s) => {
      s.onclick = (e) => {
        e.stopPropagation();
        const m = s.dataset.menu;
        if (openMenu === m) return closeMenu();
        closeMenu();
        openMenu = m;
        s.classList.add("on");
        drop.innerHTML = ADUC_MENUS[m]
          .map(([label, dis]) => `<button ${dis ? "disabled" : ""} data-a="${label}">${label}</button>`).join("");
        drop.style.left = s.offsetLeft + "px";
        drop.classList.remove("hidden");
        drop.querySelectorAll("button:not([disabled])").forEach((b) => (b.onclick = (ev) => {
          ev.stopPropagation();
          const a = b.dataset.a;
          closeMenu();
          if (a === "Refresh") select(sel);
          else if (a === "Exit") closeWin("ad");
          else if (a === "Find...") {
            const q = prompt("Find object name:");
            if (q) {
              const hit = d.containers.findIndex((c) =>
                c.items.some(([n]) => n.toLowerCase().includes(q.toLowerCase())));
              if (hit > -1) select(hit); else alert("No matching objects found.");
            }
          } else if (a === "Export List...") alert("Export List is not available in this build.");
          else if (a.startsWith("About")) alert("Active Directory Users and Computers\\nctrlaltidentity.local");
        }));
      };
    });
    body.onclick = () => closeMenu();

    select(3);
  }

  /* ============================================================
     Internet Explorer — the blog
     ============================================================ */
  const SITE_HOST = "ctrlaltidentity.dev";

  async function renderBrowser(body, opts) {
    if (postsReady) await postsReady;   // don't draw an empty index mid-load
    const stack = [];
    let at = -1;

    body.innerHTML = `<div class="ie">
      <div class="ie-menu">
        <span>File</span><span>Edit</span><span>View</span><span>Favorites</span>
        <span>Tools</span><span class="dim">Help</span>
        <img class="ie-flag" src="assets/icons/ie.svg" alt="">
      </div>
      <div class="ie-tool">
        <button class="ie-back" disabled>&#8592; <span>Back</span></button>
        <button class="ie-fwd" disabled>&#8594;</button>
        <i class="tsep"></i>
        <button class="ie-stop">&#10005;</button>
        <button class="ie-refresh">&#8635;</button>
        <button class="ie-home">&#8962; <span>Home</span></button>
      </div>
      <div class="ie-addr">
        <label>Address</label>
        <div class="ie-url"><img src="assets/icons/ie.svg" alt=""><span></span></div>
        <button class="ie-go">&#8594; Go</button>
      </div>
      <div class="ie-page"></div>
      <div class="ie-status"><span class="msg">Done</span><span class="zone">Internet</span></div>
    </div>`;

    const page = body.querySelector(".ie-page");
    const urlBox = body.querySelector(".ie-url span");
    const statusMsg = body.querySelector(".ie-status .msg");
    const backBtn = body.querySelector(".ie-back");
    const fwdBtn = body.querySelector(".ie-fwd");

    function setUrl(path) { urlBox.textContent = SITE_HOST + path; }

    function chromeState() {
      backBtn.disabled = at <= 0;
      fwdBtn.disabled = at >= stack.length - 1;
    }

    async function load(route, push, refreshing) {
      statusMsg.textContent = "Opening page...";
      page.scrollTop = 0;
      if (refreshing) {
        // a real reload has a beat where the old page is gone and the new one hasn't
        // arrived yet -- fake that on purpose so a refresh visibly *does* something,
        // rather than silently swapping identical HTML in over itself.
        page.classList.add("ie-reloading");
        await new Promise((r) => setTimeout(r, 260));
      }
      try {
        if (push) {
          stack.splice(at + 1);
          stack.push(route);
          at = stack.length - 1;
        }
        chromeState();
        if (route.kind === "news") {
          setUrl("/");
          setRoute("#/news");
          await drawNews();
          return;
        }
        if (route.kind === "linkedin") {
          setUrl("/in/luke-laverton");
          setRoute("#/linkedin");
          await drawLinkedIn();
          return;
        }
        if (route.kind === "index") {
          setUrl("/blog");
          setRoute("#/blog");
          await drawIndex();
        } else {
          const slug = slugOf(route.file);
          setUrl("/posts/" + slug);
          setRoute("#/posts/" + slug);
          await drawPost(route.post);
        }
      } finally {
        // always runs, regardless of which branch above returned early --
        // this is exactly the bug that left the page permanently blank on
        // refresh: the old code only cleared these after the shared tail,
        // which the news/linkedin branches skipped by returning early.
        statusMsg.textContent = "Done";
        page.classList.remove("ie-reloading");
      }
    }

    async function drawIndex() {
      if (!POSTS.length) {
        page.innerHTML = `<div class="ie-doc"><h1>Blog</h1><p>No posts found.</p></div>`;
        return;
      }
      const items = POSTS.map((p, i) => `
        <li>
          <a data-i="${i}">${p.title}</a>
          <small>${p.date} &nbsp;&middot;&nbsp; ${p.read} read</small>
        </li>`).join("");
      page.innerHTML = `<div class="ie-doc">
        <h1>ctrl+alt+identity</h1>
        <p class="ie-sub">Notes on identity and access management. Provisioning since 2015.</p>
        <ul class="ie-index">${items}</ul>
        <p class="ie-note">I may have vibe-coded this website, but the blog posts and opinions are all my own.</p>
      </div>`;
      page.querySelectorAll(".ie-index a").forEach((a) => (a.onclick = () => {
        const p = POSTS[+a.dataset.i];
        load({ kind: "post", file: p.file, post: p }, true);
      }));
    }

    async function drawNews() {
      try {
        const n = await fetch("data/news.json").then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        });
        const artBlock = (colors) =>
          `<div class="news-art">${colors.map((c) => `<span style="background:${c}"></span>`).join("")}</div>`;
        const cats = n.categories.map((c) => `<span>${c}</span>`).join("");
        const cards = n.stories.map((s) => `
          <article class="news-card">
            ${artBlock(s.art)}
            <h3>${s.title}</h3>
            <p>${s.snippet}</p>
            <div class="news-byline"><b>${s.byline}</b><span>${s.date}</span></div>
          </article>`).join("");
        page.innerHTML = `<div class="news">
          <header class="news-head">
            <div class="news-masthead">${n.outlet}</div>
            <div class="news-tagline">${n.tagline}</div>
          </header>
          <nav class="news-nav">${cats}</nav>
          <div class="news-bar">${n.sectionBar} <b>&#8964;</b></div>
          <div class="news-section-label">${n.hero.kicker}</div>
          <article class="news-hero">
            ${artBlock(n.hero.art)}
            <h2>${n.hero.title}</h2>
            <p>${n.hero.snippet}</p>
            <div class="news-byline"><b>${n.hero.byline}</b><span>${n.hero.date}</span></div>
          </article>
          <div class="news-list">${cards}</div>
        </div>`;
      } catch (e) {
        page.innerHTML = `<div class="ie-doc"><h1>Cannot find server</h1>
          <p>The page could not be displayed.</p></div>`;
      }
    }

    async function drawLinkedIn() {
      try {
        const p = await fetch("posts/linkedin.json").then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        });
        const roles = p.experience.map((o) =>
          `<div class="li-org"><b>${o.org}</b></div>` +
          o.roles.map((r) => `<div class="li-role"><b>${r.title}</b><small>${r.dates} · ${r.length}</small></div>`).join("")
        ).join("");
        const certs = p.certifications.map((c) =>
          `<li><b>${c.name}</b><small>${c.issuer}${c.date ? " · " + c.date : ""}</small></li>`).join("");
        const projects = (p.projects || []).map((pr) =>
          `<li><b>${pr.name}</b><small>${pr.desc}</small></li>`).join("");
        const skillGroups = Object.entries(p.skills || {}).map(([group, items]) =>
          `<div class="li-skillgroup"><b>${group}</b><div class="li-chips">${
            items.map((s) => `<span>${s}</span>`).join("")
          }</div></div>`).join("");
        page.innerHTML = `<div class="li">
          <header class="li-head">
            <img class="li-avatar" src="assets/avatar.jpg" alt="">
            <h1></h1><p class="li-headline"></p><p class="li-meta"></p>
            <a class="li-link" href="${p.profileUrl}" target="_blank" rel="noopener">View on LinkedIn</a>
          </header>
          <section><h2>About</h2><p class="li-about"></p></section>
          <section><h2>Experience</h2>${roles}</section>
          ${skillGroups ? `<section><h2>Skills</h2>${skillGroups}</section>` : ""}
          ${projects ? `<section><h2>Some interesting projects</h2><ul class="li-certs li-projects">${projects}</ul></section>` : ""}
          <section><h2>Licenses &amp; Certifications</h2><ul class="li-certs">${certs}</ul></section>
        </div>`;
        page.querySelector("h1").textContent = p.name;
        page.querySelector(".li-headline").textContent = p.headline;
        page.querySelector(".li-meta").textContent = p.company + " · " + p.location;
        page.querySelector(".li-about").textContent = p.about;
      } catch (e) {
        page.innerHTML = `<div class="ie-doc"><h1>Cannot find server</h1>
          <p>The page could not be displayed.</p></div>`;
      }
    }

    async function drawPost(p) {
      try {
        const md = await fetch("posts/" + p.file).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.text();
        });
        page.innerHTML = `<div class="ie-doc post">
          <h1></h1>
          <div class="ie-meta"></div>
          ${markdown(md)}
          <p class="ie-back-link"><a data-back>&#8592; Back to all posts</a></p>
        </div>`;
        page.querySelector("h1").textContent = p.title;
        page.querySelector(".ie-meta").textContent = `${p.date} · ${p.read} read · Luke Laverton`;
        page.querySelector("[data-back]").onclick = () => load({ kind: "index" }, true);
      } catch (e) {
        page.innerHTML = `<div class="ie-doc"><h1>Cannot find server</h1>
          <p>The page <code>posts/${p.file}</code> could not be displayed.</p></div>`;
      }
    }

    backBtn.onclick = () => { if (at > 0) { at--; load(stack[at], false); } };
    fwdBtn.onclick = () => { if (at < stack.length - 1) { at++; load(stack[at], false); } };
    body.querySelector(".ie-home").onclick = () => load({ kind: "news" }, true);
    body.querySelector(".ie-refresh").onclick = (e) => {
      const btn = e.currentTarget;
      btn.classList.remove("spin");
      void btn.offsetWidth;   // force reflow so the animation restarts on every tap, even rapid ones
      btn.classList.add("spin");
      setTimeout(() => btn.classList.remove("spin"), 500);
      load(stack[at], false, true);
    };
    body.querySelector(".ie-go").onclick = () => load(stack[at], false);
    body.querySelector(".ie-stop").onclick = () => (statusMsg.textContent = "Done");

    body._navigate = async (p) => {
      await load({ kind: "index" }, true);
      await load({ kind: "post", file: p.file, post: p }, true);
    };

    if (opts && opts.start === "linkedin") {
      await load({ kind: "linkedin" }, true);
    } else if (opts && opts.post) {
      // deep link straight to a post, from the balloon or a shared URL
      await load({ kind: "index" }, true);
      await load({ kind: "post", file: opts.post.file, post: opts.post }, true);
    } else {
      await load({ kind: "index" }, true);
    }
  }

  /* ============================================================
     Control Panel
     ============================================================ */
  function renderControlPanel(body) {
    const applets = [
      ["display", "Display", "computer", "Change the screen effects"],
      ["sounds", "Sounds and Audio Devices", "network", "Change the sound scheme"],
      ["about", "System", "shield", "View information about this computer"],
    ];
    body.innerHTML = `<div class="cpl">
      <p class="cpl-head">Pick a category</p>
      <div class="cpl-grid">${applets.map(([k, l, ic, d]) =>
        `<button data-k="${k}"><img src="assets/icons/${ic}.svg" alt="">
           <span><b>${l}</b><small>${d}</small></span></button>`).join("")}</div>
      <div class="cpl-dlg hidden"></div>
    </div>`;

    const dlg = body.querySelector(".cpl-dlg");

    function open(kind) {
      let inner = "";
      if (kind === "display") {
        inner = `<h3>Display Properties</h3>
          <label class="cpl-row"><input type="checkbox" id="cplCrt"><span>CRT screen effect</span></label>
          <p class="cpl-hint">Scanlines and grain over the whole desktop.</p>`;
      } else if (kind === "sounds") {
        inner = `<h3>Sounds and Audio Devices</h3>
          <label class="cpl-row"><input type="checkbox" id="cplSound"><span>Play Windows sounds</span></label>
          <p class="cpl-hint">Startup, window and notification sounds.</p>`;
      } else {
        inner = `<h3>System</h3>
          <table class="cpl-sys">
            <tr><th>System</th><td>ctrl+alt+identity, Identity Edition</td></tr>
            <tr><th>Registered to</th><td>Luke Laverton</td></tr>
            <tr><th>Uptime</th><td>Provisioning since 2015</td></tr>
          </table>`;
      }
      dlg.innerHTML = `<div class="cpl-box">${inner}
        <div class="cpl-foot"><button class="cpl-ok">OK</button></div></div>`;
      dlg.classList.remove("hidden");

      const crt = dlg.querySelector("#cplCrt");
      if (crt) {
        crt.checked = crtOn;
        crt.onchange = () => setCrt(crt.checked, true);
      }
      const snd = dlg.querySelector("#cplSound");
      if (snd) {
        snd.checked = soundOn;
        snd.onchange = () => { setSound(snd.checked, true); if (snd.checked) { primeAudio(); play("ding"); } };
      }
      dlg.querySelector(".cpl-ok").onclick = () => dlg.classList.add("hidden");
    }

    body.querySelectorAll(".cpl-grid button").forEach((b) => (b.onclick = () => open(b.dataset.k)));
  }

  /* ============================================================
     Search
     ============================================================ */
  const bodyCache = {};

  async function renderSearch(body) {
    if (postsReady) await postsReady;
    body.innerHTML = `<div class="srch">
      <div class="srch-bar">
        <img src="assets/icons/search.svg" alt="">
        <input placeholder="Search the blog" autocomplete="off">
      </div>
      <div class="srch-results"><p class="srch-hint">Type to search ${POSTS.length} post${POSTS.length === 1 ? "" : "s"}.</p></div>
    </div>`;

    const input = body.querySelector("input");
    const out = body.querySelector(".srch-results");

    async function corpus() {
      await Promise.all(POSTS.map(async (p) => {
        if (bodyCache[p.file]) return;
        try { bodyCache[p.file] = (await fetch("posts/" + p.file).then((r) => r.text())).toLowerCase(); }
        catch (e) { bodyCache[p.file] = ""; }
      }));
    }

    function snippet(text, q) {
      const i = text.indexOf(q);
      if (i < 0) return "";
      const s = Math.max(0, i - 60);
      return "..." + text.slice(s, i + 90).replace(/\s+/g, " ").trim() + "...";
    }

    let timer = null;
    input.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 160);
    };

    async function run() {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) {
        out.innerHTML = `<p class="srch-hint">Type to search ${POSTS.length} post${POSTS.length === 1 ? "" : "s"}.</p>`;
        return;
      }
      out.innerHTML = `<p class="srch-hint">Searching...</p>`;
      await corpus();
      const hits = POSTS
        .map((p) => {
          const t = p.title.toLowerCase(), b = bodyCache[p.file] || "";
          if (!t.includes(q) && !b.includes(q)) return null;
          return { p, snip: t.includes(q) ? "" : snippet(b, q) };
        })
        .filter(Boolean);

      if (!hits.length) {
        out.innerHTML = `<p class="srch-hint">No posts matched <b>${esc(q)}</b>.</p>`;
        return;
      }
      out.innerHTML = `<p class="srch-count">${hits.length} result${hits.length === 1 ? "" : "s"}</p>` +
        hits.map((h, i) => `<button class="srch-hit" data-i="${i}">
            <b>${esc(h.p.title)}</b>
            <small>${h.p.date} · ${h.p.read} read</small>
            ${h.snip ? `<em>${esc(h.snip)}</em>` : ""}
          </button>`).join("");
      out.querySelectorAll(".srch-hit").forEach((b) =>
        (b.onclick = () => openWindow("posts", { post: hits[+b.dataset.i].p })));
    }
  }

  /* ============================================================
     Desktop + start menu
     ============================================================ */
  function buildDesktop() {
    const box = $("#desktopIcons");
    const cols = { 1: el("div", "icon-col"), 2: el("div", "icon-col") };
    box.append(cols[1], cols[2]);
    ITEMS.forEach((it) => {
      const b = el("button", "icon");
      b.innerHTML = `<img src="assets/icons/${it.icon}.svg" alt=""><span></span>`;
      b.querySelector("span").textContent = it.label;
      b.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll(".icon.sel").forEach((n) => n.classList.remove("sel"));
        b.classList.add("sel");
        if (isMobile()) openWindow(it.id);
      };
      b.ondblclick = () => openWindow(it.id);
      cols[it.col || 1].appendChild(b);
    });

    const ul = $("#startItems");
    const add = (label, icon, fn) => {
      const li = el("li");
      const b = el("button");
      b.innerHTML = `<img src="assets/icons/${icon}.svg" alt=""><span></span>`;
      b.querySelector("span").textContent = label;
      b.onclick = () => { fn(); toggleStart(false); };
      li.appendChild(b);
      ul.appendChild(li);
    };
    ITEMS.forEach((it) => add(it.label, it.icon, () => openWindow(it.id)));
    const sep = el("li", "sep");
    ul.appendChild(sep);
    add("Control Panel", "settings", () => openWindow("control", { w: 470, h: 400 }));
    add("Task Manager", "taskmgr", () => openWindow("taskmgr"));
  }

  function toggleStart(on) {
    const m = $("#startMenu"), s = $("#scrim"), b = $("#startBtn");
    const next = on === undefined ? m.classList.contains("hidden") : on;
    m.classList.toggle("hidden", !next);
    s.classList.toggle("hidden", !next);
    b.classList.toggle("on", next);
  }

  function tickClock() {
    $("#clock").textContent = new Date()
      .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
      .toUpperCase();
  }

  /* ============================================================
     Boot sequence
     ============================================================ */
  function show(id) {
    ["#boot", "#login", "#welcome", "#desktop", "#transition", "#poweroff"].forEach((s) =>
      $(s).classList.toggle("hidden", s !== id)
    );
  }

  let postsReady = null;
  function loadPosts() {
    postsReady = fetch("posts/index.json")
      .then((r) => r.json())
      .then((d) => (POSTS = d))
      .catch(() => (POSTS = []));
    return postsReady;
  }

  /* ============================================================
     Tray balloon — surfaces the newest post
     ============================================================ */
  let balloonTimer = null;

  function showBalloon() {
    const p = POSTS[0];
    if (!p) return;
    const b = $("#balloon");
    $("#balloonPost").textContent = p.title;
    $("#balloonSub").textContent = `Published ${p.date} · ${p.read} read`;
    b.classList.remove("hidden");
    play("balloon");
    balloonTimer = setTimeout(hideBalloon, 12000);
  }

  function hideBalloon() {
    clearTimeout(balloonTimer);
    $("#balloon").classList.add("hidden");
  }

  /* ============================================================
     Log Off / Restart / Shut Down
     ============================================================ */
  const SHUT_ICON = {
    restart: '<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#3f9c22"/><path d="M20 9v8M20 23v8M9 20h8M23 20h8M12 12l6 6M22 22l6 6M28 12l-6 6M18 22l-6 6" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>',
    logoff:  '<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#e08a1e"/><circle cx="16" cy="16" r="5.5" fill="none" stroke="#fff" stroke-width="3.2"/><path d="M19 19l10 10M25 25l3 3M22 28l3 3" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>',
    shut:    '<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#c0392b"/><circle cx="20" cy="21" r="9" fill="none" stroke="#fff" stroke-width="3.2"/><path d="M20 8v11" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>',
  };

  function transition(msg, foot, after, ms) {
    $("#transMsg").textContent = msg;
    $("#transFoot").textContent = foot;
    show("#transition");
    setTimeout(after, ms);
  }

  function openShut(mode) {
    toggleStart(false);
    const logOff = mode === "logoff";
    $("#xpshutTitle").textContent = logOff ? "Log Off ctrl+alt+identity" : "Turn off ctrl+alt+identity";
    const opts = logOff
      ? [["restart", "Restart"], ["logoff", "Log Off"]]
      : [["restart", "Restart"], ["shut", "Turn Off"]];
    $("#xpshutOpts").innerHTML = opts
      .map(([k, l]) => `<button data-k="${k}">${SHUT_ICON[k]}<span>${l}</span></button>`).join("");
    $("#xpshut").classList.remove("hidden");
    $("#xpshutOpts").querySelectorAll("button").forEach((b) => (b.onclick = () => {
      $("#xpshut").classList.add("hidden");
      doPower(b.dataset.k);
    }));
  }

  function doPower(kind) {
    [...wins.keys()].forEach(closeWin);
    hideBalloon();
    play(kind === "logoff" ? "logoff" : "shutdown");
    if (kind === "logoff") {
      transition("Logging off...", "ctrl+alt+identity", () => show("#login"), 2000);
    } else if (kind === "restart") {
      transition("ctrl+alt+identity is shutting down...", "ctrl+alt+identity is restarting", () => {
        show("#boot");
        setTimeout(() => show("#login"), 3600);
      }, 2200);
    } else {
      transition("ctrl+alt+identity is shutting down...", "ctrl+alt+identity", () => show("#poweroff"), 2200);
    }
  }

  function init() {
    buildDesktop();
    tickClock();
    setInterval(tickClock, 15000);
    loadPosts();   // balloon waits on this via its 4.2s delay

    $("#startBtn").onclick = (e) => { e.stopPropagation(); play("start"); toggleStart(); };

    document.querySelectorAll(".soundbtn").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        setSound(!soundOn, true);
        if (soundOn) { primeAudio(); play("balloon"); }   // confirm it works
      };
    });
    setSound(soundOn, false);
    setCrt(crtOn, false);           // paint both toggles to match saved state
    $("#scrim").onclick = () => toggleStart(false);
    $("#logOffBtn").onclick = (e) => { e.stopPropagation(); openShut("logoff"); };
    $("#shutBtn").onclick   = (e) => { e.stopPropagation(); openShut("shut"); };
    $("#xpshutCancel").onclick = () => $("#xpshut").classList.add("hidden");
    $("#poweroff").onclick = () => location.reload();
    $("#desktop").addEventListener("click", () =>
      document.querySelectorAll(".icon.sel").forEach((n) => n.classList.remove("sel"))
    );

    $("#balloonClose").onclick = (e) => { e.stopPropagation(); hideBalloon(); };
    $("#balloonRead").onclick = (e) => {
      e.stopPropagation();
      const p = POSTS[0];
      hideBalloon();
      if (p) openWindow("posts", { post: p });
    };
    // the tray shield is the thing the balloon points at, so let it re-open it
    document.querySelector(".tray img[alt='Security']").onclick = showBalloon;

    $("#loginBtn").onclick = () => {
      primeAudio();                   // first real gesture: decode everything now
      play("startup");                // first real user gesture, so audio is allowed here
      show("#welcome");
      setTimeout(() => show("#desktop"), 1800);
      setTimeout(showBalloon, 4200);   // lands after the desktop has settled
    };

    if (location.hash.length > 2) {
      // arrived from a shared link: go straight to the content
      show("#desktop");
      applyRoute();
    } else {
      setTimeout(() => show("#login"), 3600);
    }

    window.addEventListener("hashchange", () => { if (!suppressHash) applyRoute(); });

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.altKey && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        if (!$("#desktop").classList.contains("hidden")) openWindow("taskmgr", { w: 470, h: 350 });
      }
      if (e.key === "Escape") toggleStart(false);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
