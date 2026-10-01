// admin only (see PLOOG_ADMINS in _auth.js)
// GET  /api/admin                                   -> { users: [{ id, name, days, ploogers, password, joined, firstLog }] }
//   joined: ms timestamp of sign-up, or null for accounts made before that was recorded;
//   firstLog: their earliest logged day (YYYY-MM-DD) as a stand-in for those
// POST /api/admin { action: "delete", name, confirm } -> { ok: true }
//   deletes another user completely. `confirm` must repeat their username (any case).

const { redis, USERS, JOINED, AUTH, logKey, friendsKey, idOf, fail } = require("./_redis");
const { requireAdmin } = require("./_auth");
const { deleteAccount } = require("./_accounts");

module.exports = async (req, res) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;

    if (req.method === "GET") {
      const flat = (await redis("HGETALL", USERS)) || [];
      const users = [];
      for (let i = 0; i < flat.length; i += 2) users.push({ id: flat[i], name: flat[i + 1] });
      await Promise.all(users.map(async (u) => {
        const [days, ploogers, password, joined] = await Promise.all([
          redis("HLEN", logKey(u.id)),
          redis("SCARD", friendsKey(u.id)),
          redis("HEXISTS", AUTH, u.id),
          redis("HGET", JOINED, u.id),
        ]);
        let firstLog = null;
        if (!joined && days) firstLog = ((await redis("HKEYS", logKey(u.id))) || []).sort()[0] || null;
        Object.assign(u, { days, ploogers, password: !!password, joined: joined ? Number(joined) : null, firstLog });
      }));
      users.sort((a, b) => a.id.localeCompare(b.id));
      return res.status(200).json({ users });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

    const { action, name, confirm } = req.body || {};
    if (action !== "delete") return res.status(400).json({ error: "unknown action" });
    const id = idOf(name);
    if (!id) return res.status(400).json({ error: "username required" });
    if (id === me) return res.status(400).json({ error: "delete yourself from settings instead 😅" });
    if (idOf(confirm) !== id) return res.status(400).json({ error: "confirmation doesn't match the username" });
    if (!(await redis("HEXISTS", USERS, id))) return res.status(404).json({ error: "no one goes by that name 👻" });

    await deleteAccount(id);
    res.status(200).json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
};
