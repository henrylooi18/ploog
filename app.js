// ploog — the bowel movement tracker your colon deserves 💩
// all data lives in localStorage on this device.

const $ = (sel) => document.querySelector(sel);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

/* ---------- storage ---------- */

const STORE_KEY = "ploog:v1";

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && data.users) return data;
  } catch {}
  return { users: {}, current: null };
}

let db = load();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch {}
}

const user = () => db.users[db.current];

function setEntry(key, entry) {
  if (entry) user().log[key] = entry;
  else delete user().log[key];
  save();
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

function boot() {
  if (db.current && db.users[db.current]) {
    user().log[todayKey()] ? showCalendar() : showAsk();
  } else {
    show("login");
    setTimeout(() => $("#username").focus(), 50);
  }
}

/* login */

$("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#username").value.trim();
  if (!name) return;
  const id = name.toLowerCase();
  if (!db.users[id]) db.users[id] = { name, log: {} };
  db.current = id;
  save();
  $("#username").value = "";
  boot();
});

$("#logout").addEventListener("click", () => {
  db.current = null;
  save();
  boot();
});

/* the question */

function showAsk() {
  const h = new Date().getHours();
  const hi = h < 5 ? "it's late bestie" : h < 12 ? "gm" : h < 18 ? "good afternoon" : "good evening";
  $("#greet").textContent = `${hi}, ${user().name} ☀️`;
  show("ask");
}

$("#btn-yes").addEventListener("click", () => {
  const prev = user().log[todayKey()];
  setEntry(todayKey(), { p: 1, v: prev && prev.p ? prev.v : undefined });
  showYay();
});

$("#btn-no").addEventListener("click", () => {
  setEntry(todayKey(), { p: 0 });
  showNay();
});

$("#skip-to-cal").addEventListener("click", showCalendar);

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
  const [title, sub] = pick(YAY);
  $("#yay-title").textContent = title;
  $("#yay-sub").textContent = sub;
  const drawVibes = () =>
    renderVibes($("#yay-vibes"), user().log[todayKey()].v, (v) => {
      setEntry(todayKey(), { p: 1, v: v.id });
      drawVibes();
      toast(`${v.e} ${v.n}. noted 📝`);
      burst([v.e], 14);
    });
  drawVibes();
  show("yay");
  rain(["💩", "🎉", "✨", "🧻", "💩", "🥳", "💖"], 70);
  setTimeout(() => burst(["💩", "🎊", "⭐"], 30), 150);
}

$("#yay-next").addEventListener("click", showCalendar);

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
  showCalendar();
  toast("tomorrow's a new day 🌅");
});

/* ---------- calendar ---------- */

let viewYear, viewMonth;

function showCalendar() {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  renderCalendar();
  show("cal");
}

function streak() {
  const log = user().log;
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
  const entry = user().log[todayKey()];
  const el = $("#today-banner");
  let e, title, sub, cls;
  if (!entry) {
    [e, title, sub, cls] = ["👀", "today: pending…", "you haven't checked in yet", "pending"];
  } else if (entry.p) {
    const v = VIBES.find((x) => x.id === entry.v);
    [e, title, sub, cls] = ["💩", "today: dropped ✅", v ? `vibe: ${v.e} ${v.n}` : "slay responsibly", "yes"];
  } else {
    [e, title, sub, cls] = ["🥲", "today: nothing yet", "the day isn't over. believe.", "no"];
  }
  el.className = `today card ${cls}`;
  el.innerHTML = `
    <span class="big-e">${e}</span>
    <div class="grow"><div class="t-title">${title}</div><div class="t-sub">${sub}</div></div>
    <button class="btn btn-pink tiny" id="reanswer">${entry ? "update" : "check in"}</button>`;
  $("#reanswer").addEventListener("click", showAsk);
}

function renderCalendar() {
  const u = user();
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

  let yes = 0, logged = 0;
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

    let emoji = "", vibe = "";
    if (entry) {
      logged++;
      if (entry.p) {
        yes++;
        btn.classList.add("yes");
        emoji = "💩";
        const v = VIBES.find((x) => x.id === entry.v);
        if (v) vibe = v.e;
      } else {
        btn.classList.add("no");
        emoji = "🥲";
      }
    }
    btn.innerHTML = `<span class="d">${day}</span><span class="e">${emoji}</span><span class="v">${vibe}</span>`;
    btn.setAttribute("aria-label", `${date.toDateString()}${entry ? (entry.p ? ", pooped" : ", no poop") : ""}`);
    if (!future) btn.addEventListener("click", () => openDay(key, date));
    grid.appendChild(btn);
  }

  const rate = logged ? yes / logged : 0;
  $("#stat-streak").textContent = streak();
  $("#stat-month").textContent = yes;
  $("#stat-rate").textContent = `${Math.round(rate * 100)}%`;
  const rank = logged ? RANKS.find(([min]) => rate >= min)[1] : RANKS[RANKS.length - 1][1];
  $("#rank").innerHTML = `rank: <b>${rank}</b>`;
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
  const entry = user().log[editingKey];
  $("#m-yes").classList.toggle("on", !!entry && entry.p === 1);
  $("#m-no").classList.toggle("on", !!entry && entry.p === 0);
  renderVibes($("#m-vibes"), entry && entry.p ? entry.v : null, (v) => {
    setEntry(editingKey, { p: 1, v: v.id });
    renderModal();
    renderCalendar();
  });
}

$("#m-yes").addEventListener("click", () => {
  const entry = user().log[editingKey];
  setEntry(editingKey, { p: 1, v: entry && entry.p ? entry.v : undefined });
  renderModal();
  renderCalendar();
  burst(["💩", "✨"], 12);
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

boot();
