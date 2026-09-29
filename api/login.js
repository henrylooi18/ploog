// POST /api/login { name } -> { id, name, log }
// no password: the username is the account. creates it on first login.

const { redis, USERS, cleanName, idOf, getLog, fail } = require("./_redis");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const name = cleanName(req.body && req.body.name);
  if (!name) return res.status(400).json({ error: "name required" });
  const id = idOf(name);

  try {
    await redis("HSETNX", USERS, id, name);
    const [storedName, log] = await Promise.all([redis("HGET", USERS, id), getLog(id)]);
    res.status(200).json({ id, name: storedName, log });
  } catch (err) {
    fail(res, err);
  }
};
