// PUT /api/log { date, entry | null, notify? } -> { ok: true }
//   entry = { p: 0 } for "nope", or { p: 1, d: [vibe, ...] } with one vibe per drop that day
//   (vibe 1..5, 0 = no vibe). null clears the day.
//   older entries were stored as { p: 1, v?: 1..5 }, meaning a single drop; still accepted.
//   notify: true tells your friends you just dropped one (once per day).
// reading your own log comes from GET /api/auth; friends' logs from GET /api/friends.

const { redis, logKey, friendsKey, notify, fail } = require("./_redis");
const { requireUser } = require("./_auth");

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DROPS = 10;

function cleanEntry(entry) {
  if (!entry || (entry.p !== 0 && entry.p !== 1)) return null;
  if (entry.p === 0) return { p: 0 };
  const drops = Array.isArray(entry.d) ? entry.d : [entry.v];
  if (!drops.length || drops.length > MAX_DROPS) return null;
  return { p: 1, d: drops.map((v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0)) };
}

module.exports = async (req, res) => {
  if (req.method !== "PUT") return res.status(405).json({ error: "method not allowed" });
  try {
    const id = await requireUser(req, res);
    if (!id) return;

    const body = req.body || {};
    if (!DATE.test(body.date || "")) return res.status(400).json({ error: "bad date" });

    if (body.entry === null) {
      await redis("HDEL", logKey(id), body.date);
      return res.status(200).json({ ok: true });
    }

    const entry = cleanEntry(body.entry);
    if (!entry) return res.status(400).json({ error: "bad entry" });
    await redis("HSET", logKey(id), body.date, JSON.stringify(entry));

    if (body.notify && entry.p === 1) {
      // NX: only the first "yes" for a date pings friends
      const first = await redis("SET", `ploog:dropped:${id}:${body.date}`, 1, "NX", "EX", 172800);
      if (first) {
        const friends = (await redis("SMEMBERS", friendsKey(id))) || [];
        await Promise.all(friends.map((f) => notify(f, { type: "dropped", from: id })));
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
};
