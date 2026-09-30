// ploog "poop report" + ploogers leaderboard.
// loaded before app.js and uses its helpers (me, drops, VIBES, vibeOf, keyOf, streak,
// monthCount, esc, friendsData) at call time.

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAYS_LONG = ["sundays", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays"];

const parseKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const shortDate = (date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase();
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- numbers ---------- */

function analyse(log) {
  const days = Object.keys(log).sort();
  const vibes = [0, 0, 0, 0, 0, 0]; // index = vibe id, 0 = unrated
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  let total = 0, best = null, longest = 0, run = 0, prevKey = null;

  for (const key of days) {
    const d = drops(log[key]);
    if (!d.length) {
      run = 0;
      prevKey = null;
      continue;
    }
    total += d.length;
    if (!best || d.length > best.n) best = { key, n: d.length };
    d.forEach((v) => vibes[v]++);
    weekday[parseKey(key).getDay()] += d.length;

    // streaks count consecutive calendar days with at least one drop
    const expected = prevKey && parseKey(prevKey);
    if (expected) expected.setDate(expected.getDate() + 1);
    run = expected && keyOf(expected) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    prevKey = key;
  }

  return { logged: days.length, total, best, longest, vibes, weekday };
}

/* ---------- the report ---------- */

// the last 7 days, each showing that day's vibe
function weekStrip(log) {
  const tiles = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const entry = log[keyOf(date)];
    const d = drops(entry);
    const rated = d.find((v) => v);
    const [e, cls, what] = d.length
      ? [vibeOf(rated)?.e || "💩", "yes", rated ? vibeOf(rated).n : "dropped"]
      : entry ? ["🥲", "no", "nothing"] : ["", "none", "not logged"];
    const day = i === 0 ? "today" : WEEKDAYS[date.getDay()];
    tiles.push(`
      <li class="wk ${cls}" title="${day}: ${what}${d.length > 1 ? ` (x${d.length})` : ""}">
        <span class="wk-e">${e}</span>
        ${d.length > 1 ? `<span class="wk-n">x${d.length}</span>` : ""}
        <span class="wk-d">${day}</span>
      </li>`);
  }
  return `<ol class="week" aria-label="last 7 days">${tiles.join("")}</ol>`;
}

function renderAnalysis() {
  const panel = document.getElementById("analysis");
  if (!me) return;

  const a = analyse(me.log);
  if (!a.total) {
    panel.innerHTML = `
      <h2>your poop report 🧾</h2>
      <p class="report-empty">nothing to report yet. log your first drop and this fills up ✨</p>`;
    return;
  }

  const current = streak(me.log);
  const rated = a.vibes.slice(1).reduce((s, n) => s + n, 0);
  const ranked = VIBES.map((v) => ({ ...v, count: a.vibes[v.id] }))
    .filter((v) => v.count)
    .sort((x, y) => y.count - x.count);
  const top = ranked[0];
  const powerDay = a.weekday.indexOf(Math.max(...a.weekday));
  const perDay = (a.total / a.logged).toFixed(1);

  const streakLine = current
    ? `🔥 ${plural(current, "day")} in a row`
    : "no streak rn. today's a great day to start 🌱";

  panel.innerHTML = `
    <h2>your poop report 🧾</h2>

    <section class="streak-box">
      <p class="streak-title">${streakLine}</p>
      <p class="streak-sub">longest ever: ${plural(a.longest, "day")}</p>
      ${weekStrip(me.log)}
    </section>

    <section class="vibe-card">
      ${top
        ? `<span class="vibe-big">${top.e}</span>
           <div>
             <p class="vibe-title">you're mostly <b>${top.n}</b></p>
             <p class="vibe-sub">${Math.round((top.count / rated) * 100)}% of your rated drops</p>
             <p class="vibe-pills">${ranked.map((v) => `<span title="${v.n}">${v.e} ${v.count}</span>`).join("")}</p>
           </div>`
        : `<span class="vibe-big">🤔</span>
           <p class="vibe-title">rate your drops to find out your vibe</p>`}
    </section>

    <ul class="facts">
      <li><span>💥</span><span>record day: <b>${plural(a.best.n, "drop")}</b> on ${shortDate(parseKey(a.best.key))}</span></li>
      <li><span>📅</span><span>your power day: <b>${WEEKDAYS_LONG[powerDay]}</b></span></li>
      <li><span>🧻</span><span><b>${plural(a.total, "drop")}</b> all time, about ${perDay} a day</span></li>
    </ul>`;
}

/* ---------- leaderboard ---------- */

const BOARD = {
  streak: { label: "🔥 streak", value: (log) => streak(log), unit: (n) => (n === 1 ? "day" : "days") },
  month: { label: "💩 this month", value: (log) => monthCount(log), unit: (n) => (n === 1 ? "drop" : "drops") },
};
let boardMode = "streak";

function renderBoard() {
  const panel = document.getElementById("board");
  if (!me) return;

  const friends = (friendsData && friendsData.friends) || [];
  const people = [{ id: me.id, name: me.name, log: me.log, me: true }, ...friends]
    .map((p) => ({ ...p, score: BOARD[boardMode].value(p.log) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // ties share a place; nobody gets a medal for 0
  let place = 0;
  const rows = people.map((p, i) => {
    if (i === 0 || p.score !== people[i - 1].score) place = i + 1;
    const medal = p.score ? ["🥇", "🥈", "🥉"][place - 1] : null;
    return `
      <li class="board-row${p.me ? " me" : ""}">
        <span class="place">${medal || place}</span>
        <span class="b-name">@${esc(p.name)}${p.me ? " <small>(you)</small>" : ""}</span>
        <span class="b-val">${p.score} <small>${BOARD[boardMode].unit(p.score)}</small></span>
      </li>`;
  });

  panel.innerHTML = `
    <div class="board-head">
      <h2>leaderboard 🏆</h2>
      <div class="seg" role="group" aria-label="rank by">
        ${Object.entries(BOARD).map(([mode, b]) =>
          `<button type="button" data-board="${mode}" aria-pressed="${mode === boardMode}">${b.label}</button>`).join("")}
      </div>
    </div>
    <ol class="board-list">${rows.join("")}</ol>
    ${friends.length ? "" : `<p class="board-hint">add ploogers to see who's the most regular 👀</p>`}`;
}

document.getElementById("board").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-board]");
  if (!btn) return;
  boardMode = btn.dataset.board;
  renderBoard();
});
