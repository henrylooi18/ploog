// GET  /api/auth                                  -> { id, name, log } for the logged-in user, or 401
// POST /api/auth { action: "lookup", name }       -> { status: "new" | "set-password" | "login" }
// POST /api/auth { action: "register", name, password } -> { id, name, log }
//   creates a new account, or sets the first password on an existing (pre-password) one
// POST /api/auth { action: "login", name, password }    -> { id, name, log }
// POST /api/auth { action: "logout" }             -> { ok: true }

const { redis, USERS, AUTH, cleanName, idOf, getLog, fail } = require("./_redis");
const { hashPassword, verifyPassword, startSession, endSession, sessionUser } = require("./_auth");

const MAX_FAILS = 10; // failed logins per username per 15 min
const failKey = (id) => `ploog:fails:${id}`;

async function me(id) {
  const [name, log] = await Promise.all([redis("HGET", USERS, id), getLog(id)]);
  return { id, name: name || id, log };
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const id = await sessionUser(req);
      if (!id) return res.status(401).json({ error: "not logged in" });
      return res.status(200).json(await me(id));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

    const { action, password } = req.body || {};

    if (action === "logout") {
      await endSession(req, res);
      return res.status(200).json({ ok: true });
    }

    const name = cleanName(req.body && req.body.name);
    if (!name) return res.status(400).json({ error: "username required" });
    const id = idOf(name);

    if (action === "lookup") {
      const [exists, hasPassword] = await Promise.all([redis("HEXISTS", USERS, id), redis("HEXISTS", AUTH, id)]);
      const status = hasPassword ? "login" : exists ? "set-password" : "new";
      return res.status(200).json({ status });
    }

    if (typeof password !== "string" || password.length < 6 || password.length > 100) {
      return res.status(400).json({ error: "password needs 6+ characters" });
    }

    if (action === "register") {
      await redis("HSETNX", USERS, id, name);
      // HSETNX so two people can't race to set the first password
      const created = await redis("HSETNX", AUTH, id, await hashPassword(password));
      if (!created) return res.status(409).json({ error: "that username already has a password 👀" });
      await startSession(req, res, id);
      return res.status(200).json(await me(id));
    }

    if (action === "login") {
      const fails = Number(await redis("GET", failKey(id))) || 0;
      if (fails >= MAX_FAILS) return res.status(429).json({ error: "too many tries. touch grass for 15 min 🌱" });

      const stored = await redis("HGET", AUTH, id);
      if (!stored || !(await verifyPassword(password, stored))) {
        if ((await redis("INCR", failKey(id))) === 1) await redis("EXPIRE", failKey(id), 900);
        return res.status(401).json({ error: "wrong password 🙅" });
      }
      await redis("DEL", failKey(id));
      await startSession(req, res, id);
      return res.status(200).json(await me(id));
    }

    res.status(400).json({ error: "unknown action" });
  } catch (err) {
    fail(res, err);
  }
};
