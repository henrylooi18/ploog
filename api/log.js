// GET /api/log?u=<id>                    -> { log }
// PUT /api/log { u, date, entry | null } -> { ok: true }
//   entry = { p: 0 | 1, v?: 1..5 }, null clears the day

const { redis, USERS, logKey, idOf, getLog, fail } = require("./_redis");

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanEntry(entry) {
  if (!entry || (entry.p !== 0 && entry.p !== 1)) return null;
  const out = { p: entry.p };
  if (entry.p === 1 && Number.isInteger(entry.v) && entry.v >= 1 && entry.v <= 5) out.v = entry.v;
  return out;
}

module.exports = async (req, res) => {
  const body = req.body || {};
  const id = idOf(req.method === "GET" ? req.query.u : body.u);
  if (!id) return res.status(400).json({ error: "user required" });

  try {
    if (!(await redis("HEXISTS", USERS, id))) return res.status(404).json({ error: "who are you 👀" });

    if (req.method === "GET") {
      return res.status(200).json({ log: await getLog(id) });
    }

    if (req.method === "PUT") {
      if (!DATE.test(body.date || "")) return res.status(400).json({ error: "bad date" });
      if (body.entry === null) {
        await redis("HDEL", logKey(id), body.date);
      } else {
        const entry = cleanEntry(body.entry);
        if (!entry) return res.status(400).json({ error: "bad entry" });
        await redis("HSET", logKey(id), body.date, JSON.stringify(entry));
      }
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    fail(res, err);
  }
};
