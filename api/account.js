// POST /api/account { action: "rename", name }    -> { id, name, log }
//   changes your username. usernames are the storage key for everything, so this moves
//   all your data and repoints other people's plooger lists / requests at the new name.
// POST /api/account { action: "delete", confirm } -> { ok: true }
//   deletes the account. `confirm` must be your username (retyped, any case).

const { redis, USERS, JOINED, AUTH, cleanName, idOf, getLog, fail } = require("./_redis");
const { requireUser, startSession, endSession, endAllSessions } = require("./_auth");
const { ownKeys, references, deleteAccount } = require("./_accounts");

async function rename(req, res, me) {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: "username required" });
  const id = idOf(name);

  // same username, different capitalisation: just update the display name
  if (id === me) {
    await redis("HSET", USERS, me, name);
    return res.status(200).json({ id, name, log: await getLog(me) });
  }

  // HSETNX claims the new name atomically
  if (!(await redis("HSETNX", USERS, id, name))) {
    return res.status(409).json({ error: "that username is taken 😤" });
  }

  const refs = await references(me);
  await Promise.all(refs.map(async (key) => {
    await redis("SREM", key, me);
    await redis("SADD", key, id);
  }));

  const to = ownKeys(id);
  await Promise.all(ownKeys(me).map(async (key, i) => {
    if (await redis("EXISTS", key)) await redis("RENAME", key, to[i]);
  }));

  await redis("HSET", AUTH, id, await redis("HGET", AUTH, me));
  const joined = await redis("HGET", JOINED, me);
  if (joined) await redis("HSET", JOINED, id, joined);
  await Promise.all([redis("HDEL", AUTH, me), redis("HDEL", USERS, me), redis("HDEL", JOINED, me)]);

  // log out other devices (their sessions point at the old name); this one gets a fresh session
  await endAllSessions(me);
  await startSession(req, res, id);
  res.status(200).json({ id, name, log: await getLog(id) });
}

async function remove(req, res, me) {
  if (idOf(req.body.confirm) !== me) {
    return res.status(400).json({ error: "that's not your username 🤨" });
  }
  await deleteAccount(me);
  await endSession(req, res); // clears this device's cookie
  res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  try {
    const me = await requireUser(req, res);
    if (!me) return;
    req.body = req.body || {};
    if (req.body.action === "rename") return await rename(req, res, me);
    if (req.body.action === "delete") return await remove(req, res, me);
    res.status(400).json({ error: "unknown action" });
  } catch (err) {
    fail(res, err);
  }
};
