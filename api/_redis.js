// tiny Upstash Redis client over its REST API — no dependencies.
// files starting with "_" are not exposed as routes by Vercel.

async function redis(...command) {
  // Vercel's Upstash integration sets KV_*; a direct Upstash setup uses UPSTASH_*
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("database env vars are not set");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `redis responded ${res.status}`);
  return data.result;
}

const USERS = "ploog:users"; // hash: id -> display name
const logKey = (id) => `ploog:log:${id}`; // hash: YYYY-MM-DD -> JSON entry

const cleanName = (name) => (typeof name === "string" ? name.trim().slice(0, 24) : "");
const idOf = (name) => cleanName(name).toLowerCase();

async function getLog(id) {
  const flat = (await redis("HGETALL", logKey(id))) || [];
  const log = {};
  for (let i = 0; i < flat.length; i += 2) {
    try { log[flat[i]] = JSON.parse(flat[i + 1]); } catch {}
  }
  return log;
}

function fail(res, err) {
  console.error(err);
  res.status(500).json({ error: "database hiccup 🫠" });
}

module.exports = { redis, USERS, logKey, cleanName, idOf, getLog, fail };
