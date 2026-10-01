// ploog — the bowel movement tracker your colon deserves 💩
// the server (/api, backed by Redis) is the source of truth.
// localStorage is a cache so the page renders instantly and survives flaky wifi.

const $ = (sel) => document.querySelector(sel);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------- storage ---------- */

// cache of { id, name, log } for the logged-in user. the session itself is an HttpOnly cookie.
const STORE_KEY = "ploog:v2";
try { localStorage.removeItem("ploog:v1"); } catch {} // pre-password cache

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && data.log) return data;
  } catch {}
  return null;
}

let me = load();

function save() {
  try {
    if (me) localStorage.setItem(STORE_KEY, JSON.stringify(me));
    else localStorage.removeItem(STORE_KEY);
  } catch {}
}

function setEntry(key, entry, { notify = false } = {}) {
  if (entry) me.log[key] = entry;
  else delete me.log[key];
  save();
  api("/api/log", { method: "PUT", body: { date: key, entry: entry || null, notify } })
    .catch(() => toast("couldn't sync to the cloud 😭"));
}

/* ---------- server ---------- */

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `${method} ${path} -> ${res.status}`), { status: res.status });
  }
  return data;
}

/* ---------- dates (always local time, never UTC) ---------- */

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => keyOf(new Date());

/* ---------- copy ---------- */

const VIBES = [
  { id: 1, e: "🪨", n: "pebbles" },
  { id: 2, e: "🥖", n: "baguette" },
  { id: 3, e: "🌭", n: "the classic" },
  { id: 4, e: "🍦", n: "soft serve" },
  { id: 5, e: "🌊", n: "tsunami" },
];
const vibeOf = (id) => VIBES.find((x) => x.id === id);

const MAX_DROPS = 10;
// the vibe of each drop that day (0 = no vibe). older entries were { p: 1, v }, i.e. one drop
const drops = (entry) => (!entry || !entry.p ? [] : Array.isArray(entry.d) ? entry.d : [entry.v || 0]);
const dropsEntry = (d) => ({ p: 1, d });

const YAY = [
  ["SLAY. 💅", "you ate… and then you un-ate."],
  ["main character bowel energy ✨", "the plot? advanced. the colon? cleared."],
  ["the prophecy has been fulfilled 🔮", "ancient scrolls spoke of this day."],
  ["W. massive W. 🏆", "put it on your linkedin."],
  ["it's giving… regular 💁", "your gut microbiome is proud of you fr."],
  ["no thoughts, just fiber 🥦", "certified lighter. certified happier."],
  ["you understood the assignment 📝", "and you turned it in on time."],
  ["delivered. 📦", "no signature required."],
];

const NAY = [
  ["not the colon ghosting you 💀", "left on read by your own intestines."],
  ["your gut is on airplane mode ✈️", "no signal. no service. no drop."],
  ["the pipeline is experiencing delays 🚧", "we apologize for the inconvenience."],
  ["it's giving… backed up 🥲", "lowkey a traffic jam down there."],
  ["this is so sad, alexa play despacito 🎶", "(it might help? worth a shot.)"],
  ["buffering… 🔄", "your download is at 0%. please hold."],
];

const TIPS = [
  "💧 hydrate or diedrate. drink a big glass of water.",
  "🍎 eat a fruit, bestie. apples, pears, kiwis are elite.",
  "🚶 go on a lil hot girl walk. movement = motivation.",
  "☕ coffee is a valid strategy. we don't judge.",
  "🥣 oats. prunes. chia. the fiber trinity.",
  "🧘 relax. your colon can sense stress. it's shy.",
  "🦶 get a footstool. squat posture is a cheat code.",
];

const RANKS = [
  [0.9, "certified regular 👑"],
  [0.7, "clockwork king/queen ⏰"],
  [0.5, "pretty consistent ngl 👍"],
  [0.3, "situationship with your colon 💔"],
  [0.01, "it's complicated 🫠"],
  [0, "log some days to get ranked 👀"],
];

/* ---------- screens ---------- */

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  $("#topbar").hidden = !me || id === "login" || id === "loading";
  window.scrollTo({ top: 0 });
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

async function boot() {
  show("loading");
  try {
    me = await api("/api/auth");
  } catch (err) {
    // 401 = logged out. anything else = offline, so keep the cached copy
    if (err.status === 401) me = null;
  }
  save();
  me ? enter() : showLogin();
}

function enter() {
  startPolling();
  me.log[todayKey()] ? showCalendar() : showAsk();
}

/* login: username first, then log in / create a password / set one for pre-password accounts */

const LOGIN_COPY = {
  login: ["welcome back 👋", "your poop diary awaits.", "log in 🔓"],
  new: ["new here? love that for you ✨", "make a password so nobody reads your poop diary.", "create account 🚀"],
  "set-password": ["OG alert 🚨", "you're from the before times. set a password to lock your diary.", "lock it in 🔐"],
};

let loginMode = "name";

function showLogin() {
  $("#username").value = "";
  setLoginMode("name");
  show("login");
  setTimeout(() => $("#username").focus(), 50);
}

function setLoginMode(mode) {
  loginMode = mode;
  const naming = mode === "name";
  $("#username").readOnly = !naming;
  $("#name-label").hidden = !naming;
  $("#pass-step").hidden = naming;
  $("#login-back").hidden = naming;
  $("#password2").hidden = mode === "login";
  $("#password").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("#password").value = $("#password2").value = "";
  $("#login-error").textContent = "";
  if (naming) {
    $("#login-btn").textContent = "next 👉";
    return;
  }
  const [title, sub, cta] = LOGIN_COPY[mode];
  $("#pass-title").textContent = title;
  $("#pass-sub").textContent = sub;
  $("#login-btn").textContent = cta;
  setTimeout(() => $("#password").focus(), 50);
}

$("#login-back").addEventListener("click", () => {
  setLoginMode("name");
  $("#username").focus();
});

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#login-error");
  const name = $("#username").value.trim();
  const password = $("#password").value;
  if (!name) return (error.textContent = "type a username first 👀");
  if (loginMode !== "name") {
    if (password.length < 6) return (error.textContent = "password needs 6+ characters 🙏");
    if (loginMode !== "login" && password !== $("#password2").value) {
      return (error.textContent = "passwords don't match 🤔");
    }
  }

  const btn = $("#login-btn");
  btn.disabled = true;
  error.textContent = "";
  try {
    if (loginMode === "name") {
      const { status } = await api("/api/auth", { method: "POST", body: { action: "lookup", name } });
      setLoginMode(status);
      return;
    }
    const action = loginMode === "login" ? "login" : "register";
    me = await api("/api/auth", { method: "POST", body: { action, name, password } });
    save();
    toast(action === "login" ? `welcome back, ${me.name} 💩` : "locked in 🔐");
    enter();
  } catch (err) {
    error.textContent = err.status ? err.message : "can't reach the server 📡";
  } finally {
    btn.disabled = false;
  }
});

function forgetMe() {
  me = null;
  save();
  stopPolling();
  closeNotifs();
  showLogin();
}

$("#logout").addEventListener("click", async () => {
  try { await api("/api/auth", { method: "POST", body: { action: "logout" } }); } catch {}
  forgetMe();
});

$("#home").addEventListener("click", () => showCalendar());

/* ---------- settings ---------- */

function showSettings() {
  closeNotifs();
  $("#new-name").value = me.name;
  $("#delete-name").textContent = me.name;
  $("#delete-confirm").value = "";
  $("#delete-btn").disabled = true;
  $("#rename-error").textContent = $("#delete-error").textContent = "";
  show("settings");
}

$("#settings-btn").addEventListener("click", showSettings);
$("#settings-back").addEventListener("click", () => showCalendar());

$("#rename-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#new-name").value.trim();
  const error = $("#rename-error");
  error.textContent = "";
  if (!name) return (error.textContent = "type a username 👀");
  if (name === me.name) return (error.textContent = "that's already your name bestie");

  $("#rename-btn").disabled = true;
  try {
    me = await api("/api/account", { method: "POST", body: { action: "rename", name } });
    save();
    $("#delete-name").textContent = me.name;
    toast(`you're @${me.name} now ✨`);
  } catch (err) {
    error.textContent = err.status ? err.message : "can't reach the server 📡";
  } finally {
    $("#rename-btn").disabled = false;
  }
});

// the delete button unlocks only once the username is retyped
$("#delete-confirm").addEventListener("input", () => {
  $("#delete-btn").disabled = $("#delete-confirm").value.trim().toLowerCase() !== me.id;
});

$("#delete-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const confirm = $("#delete-confirm").value.trim();
  if (confirm.toLowerCase() !== me.id) return;

  $("#delete-btn").disabled = true;
  try {
    await api("/api/account", { method: "POST", body: { action: "delete", confirm } });
    forgetMe();
    toast("account flushed 🚽👋");
  } catch (err) {
    $("#delete-error").textContent = err.status ? err.message : "can't reach the server 📡";
    $("#delete-btn").disabled = false;
  }
});

/* the question */

function showAsk() {
  const h = new Date().getHours();
  const hi = h < 5 ? "it's late bestie" : h < 12 ? "gm" : h < 18 ? "good afternoon" : "good evening";
  $("#greet").textContent = `${hi}, ${me.name} ☀️`;
  show("ask");
}

$("#btn-yes").addEventListener("click", () => {
  const first = !hasDropped();
  const today = drops(me.log[todayKey()]);
  setEntry(todayKey(), dropsEntry(today.length ? today : [0]), { notify: true });
  showYay();
  if (first) setTimeout(maybeAskCreator, 1600); // let the confetti land first
});

// log one more drop today (from the "+1" button once you've already dropped)
function addDropToday() {
  const today = drops(me.log[todayKey()]);
  if (today.length >= MAX_DROPS) return toast(`${MAX_DROPS} a day is the limit. see a doctor maybe? 🩺`);
  setEntry(todayKey(), dropsEntry([...today, 0]), { notify: true });
  showYay();
}

$("#btn-no").addEventListener("click", () => {
  setEntry(todayKey(), { p: 0 });
  showNay();
});

$("#skip-to-cal").addEventListener("click", () => showCalendar("diary"));

/* celebration */

function renderVibes(container, current, onPick) {
  container.innerHTML = "";
  VIBES.forEach((v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "vibe" + (current === v.id ? " on" : "");
    b.innerHTML = `<span class="e">${v.e}</span><span class="n">${v.n}</span>`;
    b.addEventListener("click", () => onPick(v));
    container.appendChild(b);
  });
}

function showYay() {
  const count = drops(me.log[todayKey()]).length;
  const [title, sub] = count > 1 ? [`x${count} combo 🔥`, "the colon is on a roll today."] : pick(YAY);
  $("#yay-title").textContent = title;
  $("#yay-sub").textContent = sub;
  // the picker rates the drop that was just logged (the last one today)
  const drawVibes = () => {
    const today = drops(me.log[todayKey()]);
    renderVibes($("#yay-vibes"), today[today.length - 1], (v) => {
      const d = drops(me.log[todayKey()]);
      d[d.length - 1] = v.id;
      setEntry(todayKey(), dropsEntry(d));
      drawVibes();
      toast(`${v.e} ${v.n}. noted 📝`);
      burst([v.e], 14);
    });
  };
  drawVibes();
  show("yay");
  rain(["💩", "🎉", "✨", "🧻", "💩", "🥳", "💖"], 70);
  setTimeout(() => burst(["💩", "🎊", "⭐"], 30), 150);
}

$("#yay-next").addEventListener("click", () => showCalendar("diary"));

/* sadness */

function showNay() {
  const [title, sub] = pick(NAY);
  $("#nay-title").textContent = title;
  $("#nay-sub").textContent = sub;
  $("#nay-tips").innerHTML = shuffle(TIPS).slice(0, 3).map((t) => `<li>${t}</li>`).join("");
  show("nay");
  rain(["💧", "💧", "💧", "🥲"], 60, true);
}

$("#nay-next").addEventListener("click", () => {
  showCalendar("diary");
  toast("tomorrow's a new day 🌅");
});

/* ---------- dashboard tabs (mobile only; desktop shows all three panels) ---------- */

const TAB_KEY = "ploog:tab";
let currentTab = "diary";
try { currentTab = localStorage.getItem(TAB_KEY) || "diary"; } catch {}

function setTab(tab) {
  currentTab = tab;
  try { localStorage.setItem(TAB_KEY, tab); } catch {}
  $("#dash").dataset.tab = tab;
  document.querySelectorAll("#tabbar [data-tab]").forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

$("#tabbar").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;
  setTab(btn.dataset.tab);
  window.scrollTo({ top: 0 });
  if (btn.dataset.tab === "board" || btn.dataset.tab === "ploogers") loadFriends(); // freshest rankings
});

/* ---------- calendar ---------- */

let viewYear, viewMonth;

// tab: which mobile tab to land on; defaults to the last one used
function showCalendar(tab = currentTab) {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  renderCalendar();
  renderFriends();
  show("cal");
  setTab(tab);
  loadFriends();
}

function streak(log) {
  const d = new Date();
  // if today isn't logged yet, the streak is still alive from yesterday
  if (!log[keyOf(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (log[keyOf(d)] && log[keyOf(d)].p) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function renderToday() {
  const entry = me.log[todayKey()];
  const el = $("#today-banner");
  const today = drops(entry);
  let e, title, sub, cls;
  if (!entry) {
    [e, title, sub, cls] = ["👀", "today: pending…", "you haven't checked in yet", "pending"];
  } else if (today.length) {
    const v = vibeOf(today[0]);
    [e, cls] = ["💩", "yes"];
    title = today.length > 1 ? `today: dropped x${today.length} 🔥` : "today: dropped ✅";
    sub = today.length > 1
      ? `<span class="drop-chips">${today.map((id) => vibeOf(id)?.e || "💩").join(" ")}</span>`
      : v ? `vibe: ${v.e} ${v.n}` : "slay responsibly";
  } else {
    [e, title, sub, cls] = ["🥲", "today: nothing yet", "the day isn't over. believe.", "no"];
  }
  el.className = `today-banner card ${cls}`;
  el.innerHTML = `
    <span class="big-e">${e}</span>
    <div class="grow"><div class="t-title">${title}</div><div class="t-sub">${sub}</div></div>
    <button class="btn btn-pink tiny" id="reanswer">${today.length ? "+1 💩" : entry ? "update" : "check in"}</button>`;
  $("#reanswer").addEventListener("click", today.length ? addDropToday : showAsk);
}

function renderCalendar() {
  const u = me;
  $("#whoami").textContent = `@${u.name}'s poop diary`;
  renderToday();

  const now = new Date();
  const tKey = todayKey();
  const first = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  $("#month-label").textContent = first
    .toLocaleDateString(undefined, { month: "long", year: "numeric" })
    .toLowerCase();
  $("#next").disabled = isCurrentMonth;

  const grid = $("#grid");
  grid.innerHTML = "";
  for (let i = 0; i < first.getDay(); i++) {
    const blank = document.createElement("div");
    blank.className = "day blank";
    grid.appendChild(blank);
  }

  let pooped = 0, total = 0, logged = 0; // days pooped, drops, days logged
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(viewYear, viewMonth, day);
    const key = keyOf(date);
    const entry = u.log[key];
    const future = key > tKey;
    const btn = document.createElement("button");
    btn.className = "day";
    btn.disabled = future;
    if (future) btn.classList.add("future");
    if (key === tKey) btn.classList.add("today");

    const d = drops(entry);
    let emoji = "", corner = "";
    if (entry) {
      logged++;
      if (d.length) {
        pooped++;
        total += d.length;
        btn.classList.add("yes");
        emoji = "💩";
        // several drops: show the count instead of a vibe
        corner = d.length > 1 ? `<span class="v count">x${d.length}</span>` : `<span class="v">${vibeOf(d[0])?.e || ""}</span>`;
      } else {
        btn.classList.add("no");
        emoji = "🥲";
      }
    }
    btn.innerHTML = `<span class="d">${day}</span><span class="e">${emoji}</span>${corner}`;
    const label = !entry ? "" : d.length ? `, pooped${d.length > 1 ? ` ${d.length} times` : ""}` : ", no poop";
    btn.setAttribute("aria-label", date.toDateString() + label);
    if (!future) btn.addEventListener("click", () => openDay(key, date));
    grid.appendChild(btn);
  }

  const rate = logged ? pooped / logged : 0;
  $("#stat-streak").textContent = streak(me.log);
  $("#stat-month").textContent = total;
  $("#stat-rate").textContent = `${Math.round(rate * 100)}%`;
  const rank = logged ? RANKS.find(([min]) => rate >= min)[1] : RANKS[RANKS.length - 1][1];
  $("#rank").innerHTML = `rank: <b>${rank}</b>`;
  renderAnalysis();
  renderBoard();
}

$("#prev").addEventListener("click", () => {
  if (--viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderCalendar();
});

$("#next").addEventListener("click", () => {
  if (++viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
});

/* ---------- day editor modal ---------- */

const modal = $("#day-modal");
let editingKey = null;

function openDay(key, date) {
  editingKey = key;
  $("#modal-date").textContent = date
    .toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    .toLowerCase();
  renderModal();
  modal.showModal();
}

function renderModal() {
  const entry = me.log[editingKey];
  const d = drops(entry);
  $("#m-yes").classList.toggle("on", d.length > 0);
  $("#m-no").classList.toggle("on", !!entry && !d.length);

  $("#m-drops").innerHTML = d.length
    ? `<p class="label">the drops ${d.length > 1 ? `<span class="count-chip">x${d.length}</span>` : ""}</p>
       <ol class="drops">
         ${d.map((vibe, i) => `
           <li class="drop">
             <span class="drop-n">#${i + 1}</span>
             <div class="mini-vibes">
               ${VIBES.map((v) => `
                 <button type="button" class="mini-vibe${v.id === vibe ? " on" : ""}" data-drop="${i}" data-vibe="${v.id}"
                   title="${v.n}" aria-label="drop ${i + 1}: ${v.n}" aria-pressed="${v.id === vibe}">${v.e}</button>`).join("")}
             </div>
             ${d.length > 1 ? `<button type="button" class="drop-x" data-remove="${i}" aria-label="remove drop ${i + 1}">✕</button>` : ""}
           </li>`).join("")}
       </ol>
       ${d.length < MAX_DROPS ? `<button type="button" class="btn btn-yellow tiny add-drop" id="m-add">+ add another 💩</button>` : ""}`
    : "";
}

function updateDrops(d) {
  setEntry(editingKey, dropsEntry(d));
  renderModal();
  renderCalendar();
}

$("#m-drops").addEventListener("click", (e) => {
  const d = drops(me.log[editingKey]);
  const vibeBtn = e.target.closest("[data-vibe]");
  const removeBtn = e.target.closest("[data-remove]");
  if (vibeBtn) {
    const i = Number(vibeBtn.dataset.drop), v = Number(vibeBtn.dataset.vibe);
    d[i] = d[i] === v ? 0 : v; // tap the chosen vibe again to unset it
    updateDrops(d);
  } else if (removeBtn) {
    d.splice(Number(removeBtn.dataset.remove), 1);
    updateDrops(d);
  } else if (e.target.closest("#m-add")) {
    updateDrops([...d, 0]);
    burst(["💩"], 8);
  }
});

$("#m-yes").addEventListener("click", () => {
  const first = !hasDropped();
  const d = drops(me.log[editingKey]);
  updateDrops(d.length ? d : [0]);
  burst(["💩", "✨"], 12);
  if (first) setTimeout(maybeAskCreator, 600); // opens on top of the day editor
});

$("#m-no").addEventListener("click", () => {
  setEntry(editingKey, { p: 0 });
  renderModal();
  renderCalendar();
});

$("#m-clear").addEventListener("click", () => {
  setEntry(editingKey, null);
  renderModal();
  renderCalendar();
  toast("wiped clean 🧹");
});

// click outside the modal to close
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.close();
});

/* ---------- "add the creator?" after your first ever drop ---------- */

const CREATOR = "henpoops";
const askedKey = () => `ploog:creator-asked:${me.id}`;

const hasDropped = () => Object.values(me.log).some((e) => drops(e).length);

async function maybeAskCreator() {
  if (!me || me.id === CREATOR) return;
  try {
    if (localStorage.getItem(askedKey())) return;
  } catch {}

  try {
    // only ask if the creator's account exists and you're not already linked up
    const [{ status }, f] = await Promise.all([
      api("/api/auth", { method: "POST", body: { action: "lookup", name: CREATOR } }),
      api("/api/friends"),
    ]);
    const linked = [...f.friends, ...f.incoming, ...f.outgoing].some((p) => p.id === CREATOR);
    if (status === "new" || linked) return;
  } catch {
    return; // offline: don't nag
  }

  try { localStorage.setItem(askedKey(), "1"); } catch {}
  $("#creator-modal").showModal();
}

$("#creator-add").addEventListener("click", async () => {
  $("#creator-modal").close();
  if (await friendAction("request", CREATOR)) burst(["👑", "💩", "✨"], 18);
});

$("#creator-nah").addEventListener("click", () => {
  $("#creator-modal").close();
  toast(`no worries. you can add @${CREATOR} anytime 👀`);
});

$("#creator-modal").addEventListener("click", (e) => {
  if (e.target === $("#creator-modal")) $("#creator-modal").close();
});

/* ---------- particle effects ---------- */

function rain(emojis, count, slow = false) {
  const fx = $("#fx");
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "fall";
    s.textContent = pick(emojis);
    const dur = (slow ? 2.2 : 2.6) + Math.random() * 2;
    s.style.left = `${Math.random() * 100}vw`;
    s.style.fontSize = `${16 + Math.random() * 26}px`;
    s.style.animationDuration = `${dur}s`;
    s.style.animationDelay = `${Math.random() * (slow ? 2.5 : 1.2)}s`;
    s.style.setProperty("--r", slow ? "0deg" : `${(Math.random() - 0.5) * 720}deg`);
    fx.appendChild(s);
    setTimeout(() => s.remove(), (dur + 3) * 1000);
  }
}

function burst(emojis, count) {
  const fx = $("#fx");
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "burst";
    s.textContent = pick(emojis);
    const angle = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * 220;
    s.style.left = "50vw";
    s.style.bottom = "40vh";
    s.style.fontSize = `${18 + Math.random() * 20}px`;
    s.style.animationDuration = `${0.9 + Math.random() * 0.6}s`;
    s.style.setProperty("--x", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--y", `${Math.sin(angle) * dist}px`);
    s.style.setProperty("--r", `${(Math.random() - 0.5) * 540}deg`);
    fx.appendChild(s);
    setTimeout(() => s.remove(), 1800);
  }
}

/* ---------- friends ---------- */

let friendsData = null; // null until the first load, so we never flash "no ploogers yet"

async function loadFriends() {
  try {
    friendsData = await api("/api/friends");
    renderFriends();
  } catch {}
}

function monthCount(log) {
  const month = todayKey().slice(0, 7);
  return Object.entries(log)
    .filter(([day]) => day.startsWith(month))
    .reduce((sum, [, e]) => sum + drops(e).length, 0);
}

function renderFriends() {
  if (!friendsData) return;
  const { friends, incoming, outgoing } = friendsData;
  const tKey = todayKey();
  $("#friend-count").textContent = friends.length || "";
  $("#ploogers-dot").hidden = !incoming.length;
  renderBoard();

  $("#friend-incoming").innerHTML = incoming
    .map((f) => `
      <div class="request">
        <span>👋 <b>@${esc(f.name)}</b> wants to be your plooger</span>
        <span class="req-actions">
          <button class="btn btn-mint tiny" data-act="accept" data-name="${esc(f.id)}">accept</button>
          <button class="link" data-act="decline" data-name="${esc(f.id)}">nah</button>
        </span>
      </div>`)
    .join("");

  // ploogers who haven't checked in yet float to the top
  const rank = (f) => (f.log[tKey] ? (f.log[tKey].p ? 2 : 1) : 0);
  const rows = [...friends]
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .map((f) => {
      const entry = f.log[tKey];
      const n = drops(entry).length;
      const [e, cls, status] = !entry
        ? ["👀", "pending", "no check-in yet"]
        : n ? ["💩", "yes", n > 1 ? `dropped x${n} 🔥` : "dropped ✅"] : ["🥲", "no", "nothing yet"];
      return `
        <li class="friend">
          <span class="f-status ${cls}">${e}</span>
          <div class="f-info">
            <b>@${esc(f.name)}</b>
            <span>${status} · 🔥${streak(f.log)} · 💩${monthCount(f.log)} this month</span>
          </div>
          <button class="btn btn-mint tiny" data-act="fart" data-name="${esc(f.id)}" aria-label="fart at @${esc(f.name)}"><span class="fart-word">fart </span>💨</button>
          <button class="link f-remove" data-act="remove" data-name="${esc(f.id)}" aria-label="unfriend @${esc(f.name)}">✕</button>
        </li>`;
    });
  $("#friend-list").innerHTML = rows.length
    ? rows.join("")
    : `<li class="empty">no ploogers yet. pooping alone is valid, but ploogers make it ✨social✨</li>`;

  $("#friend-outgoing").innerHTML = outgoing.length
    ? `<p class="fine">waiting on ${outgoing
        .map((f) => `<span class="chip">@${esc(f.name)}<button data-act="cancel" data-name="${esc(f.id)}" aria-label="cancel request">✕</button></span>`)
        .join(" ")} ⏳</p>`
    : "";
}

const FRIEND_TOASTS = {
  request: (status, name) => (status === "friends" ? `you and @${name} are ploogers now 🤝` : `request sent to @${name} 📨`),
  accept: () => "new plooger unlocked 🤝",
  decline: () => "declined. boundaries 🙅",
  cancel: () => "request unsent",
  remove: () => "unfriended 💔",
  fart: (_, name) => `you farted at @${name} 💨`,
};

// returns true if it worked
async function friendAction(action, name) {
  if (action === "remove" && !confirm(`unfriend @${name}? 💔`)) return false;
  try {
    const { status } = await api("/api/friends", { method: "POST", body: { action, name } });
    toast(FRIEND_TOASTS[action](status, name));
    if (action === "fart") burst(["💨", "💨", "💨", "🫢"], 16);
    await Promise.all([loadFriends(), loadNotifs()]);
    renderNotifs();
    return true;
  } catch (err) {
    toast(err.status ? err.message : "can't reach the server 📡");
    return false;
  }
}

// one handler for every [data-act] button: friend rows, requests, notification actions
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const ok = await friendAction(btn.dataset.act, btn.dataset.name);
  // a "fart back" from a notification only fires once
  if (ok && btn.dataset.notif) {
    firedBack.add(btn.dataset.notif);
    renderNotifs();
  }
});

$("#add-friend").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#friend-name").value.trim();
  if (!name) return;
  $("#friend-name").value = "";
  friendAction("request", name);
});

/* ---------- notifications ---------- */

let notifs = { items: [], unread: 0, seen: 0 };
let pollTimer;
let newestNotif = null; // ts of the newest notification we've already reacted to
const firedBack = new Set(); // fart notifications you've already farted back at

const NOTIF_TEXT = {
  friend_request: (n) => ["👋", `<b>@${esc(n.fromName)}</b> wants to be your plooger`],
  friend_accept: (n) => ["🤝", `<b>@${esc(n.fromName)}</b> accepted your request. ploogers now`],
  dropped: (n) => ["💩", `<b>@${esc(n.fromName)}</b> just dropped one. slay`],
  fart: (n) => ["💨", `<b>@${esc(n.fromName)}</b> farted at you`],
};

function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function loadNotifs() {
  try {
    const prevUnread = notifs.unread;
    notifs = await api("/api/notifications");
    const badge = $("#badge");
    badge.hidden = !notifs.unread;
    badge.textContent = notifs.unread > 9 ? "9+" : notifs.unread;
    if (notifs.unread > prevUnread) {
      $("#bell").classList.remove("ring");
      void $("#bell").offsetWidth; // restart the animation
      $("#bell").classList.add("ring");
    }
    // you've been farted at: make it smell (once per fart, only for ones you haven't seen)
    const farts = notifs.items.filter((n) => n.type === "fart" && n.ts > (newestNotif ?? notifs.seen));
    if (farts.length) {
      const others = farts.length > 1 ? ` (+${farts.length - 1} more)` : "";
      toast(`@${farts[0].fromName} farted at you 💨${others}`);
      rain(["💨", "💨", "🤢", "💨"], 40);
    }
    newestNotif = Math.max(newestNotif ?? 0, ...notifs.items.map((n) => n.ts));
  } catch (err) {
    // session ended elsewhere (logged out, renamed or deleted on another device)
    if (err.status === 401 && me) {
      forgetMe();
      toast("you got logged out 👋");
    }
  }
}

function renderNotifs() {
  $("#notif-list").innerHTML = notifs.items.length
    ? notifs.items
        .map((n) => {
          const [e, html] = (NOTIF_TEXT[n.type] || (() => ["🔔", "something happened 👀"]))(n);
          let actions = "";
          if (n.type === "friend_request" && n.pending) {
            actions = `<div class="n-actions">
                 <button class="btn btn-mint tiny" data-act="accept" data-name="${esc(n.from)}">accept</button>
                 <button class="link" data-act="decline" data-name="${esc(n.from)}">nah</button>
               </div>`;
          } else if (n.type === "fart") {
            actions = firedBack.has(n.id)
              ? `<div class="n-actions"><span class="n-done">farted back ✅</span></div>`
              : `<div class="n-actions">
                   <button class="btn btn-mint tiny" data-act="fart" data-name="${esc(n.from)}" data-notif="${esc(n.id)}">fart back 💨</button>
                 </div>`;
          }
          return `
            <li class="notif${n.ts > notifs.seen ? " unread" : ""}">
              <span class="n-e">${e}</span>
              <div class="n-body"><p>${html}</p>${actions}<span class="n-time">${timeAgo(n.ts)}</span></div>
            </li>`;
        })
        .join("")
    : `<li class="empty">nothing yet. it's quiet… too quiet 🦗</li>`;
  $("#notif-clear").hidden = !notifs.items.length;
}

$("#notif-clear").addEventListener("click", async () => {
  try {
    await api("/api/notifications", { method: "POST", body: { action: "clear" } });
    notifs = { items: [], unread: 0, seen: Date.now() };
    $("#badge").hidden = true;
    renderNotifs();
    toast("squeaky clean 🧼");
  } catch (err) {
    toast(err.status ? err.message : "can't reach the server 📡");
  }
});

function openNotifs() {
  renderNotifs();
  $("#notif-panel").hidden = false;
  $("#bell").setAttribute("aria-expanded", "true");
  if (notifs.unread) {
    notifs.unread = 0;
    $("#badge").hidden = true;
    api("/api/notifications", { method: "POST", body: { action: "read" } }).catch(() => {});
  }
}

function closeNotifs() {
  if ($("#notif-panel").hidden) return;
  $("#notif-panel").hidden = true;
  $("#bell").setAttribute("aria-expanded", "false");
  // once closed, what was shown counts as seen
  notifs.seen = Date.now();
}

$("#bell").addEventListener("click", () => ($("#notif-panel").hidden ? openNotifs() : closeNotifs()));

// clicking outside the notifications dropdown (or pressing escape) closes it
document.addEventListener("click", (e) => {
  if (!e.composedPath().includes($(".bell-wrap"))) closeNotifs();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeNotifs();
});

function poll() {
  if (!me || document.hidden) return;
  loadNotifs();
  if ($("#cal").classList.contains("active")) loadFriends();
}

function startPolling() {
  stopPolling();
  loadNotifs();
  pollTimer = setInterval(poll, 30000);
}

function stopPolling() {
  clearInterval(pollTimer);
  notifs = { items: [], unread: 0, seen: 0 };
  newestNotif = null;
  firedBack.clear();
  $("#badge").hidden = true;
  // don't leak the previous user's friends to the next login
  friendsData = null;
  ["#friend-incoming", "#friend-list", "#friend-outgoing", "#friend-count"].forEach((sel) => ($(sel).innerHTML = ""));
  $("#ploogers-dot").hidden = true;
}

document.addEventListener("visibilitychange", poll);

boot();
