// GET  /api/notifications            -> { items: [{ id, type, from, fromName, ts, pending? }], unread, seen }
// POST /api/notifications { action: "read" } -> { ok: true }   marks everything as seen

const { redis, notifKey, seenKey, inKey, NOTIF_LIMIT, fail } = require("./_redis");
const { requireUser } = require("./_auth");

module.exports = async (req, res) => {
  try {
    const me = await requireUser(req, res);
    if (!me) return;

    if (req.method === "POST") {
      if ((req.body || {}).action !== "read") return res.status(400).json({ error: "unknown action" });
      await redis("SET", seenKey(me), Date.now());
      return res.status(200).json({ ok: true });
    }
    if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

    const [raw, seen, incoming] = await Promise.all([
      redis("LRANGE", notifKey(me), 0, NOTIF_LIMIT - 1),
      redis("GET", seenKey(me)),
      redis("SMEMBERS", inKey(me)),
    ]);
    const pending = new Set(incoming || []);
    const items = [];
    for (const s of raw || []) {
      try {
        const item = JSON.parse(s);
        // friend requests stay actionable only while still pending
        if (item.type === "friend_request") item.pending = pending.has(item.from);
        items.push(item);
      } catch {}
    }
    const since = Number(seen) || 0;
    res.status(200).json({ items, unread: items.filter((n) => n.ts > since).length, seen: since });
  } catch (err) {
    fail(res, err);
  }
};
