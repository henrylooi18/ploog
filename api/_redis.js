// tiny Upstash Redis client over its REST API — no dependencies.
// files starting with "_" are not exposed as routes by Vercel.

const crypto = require("crypto");

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

/* ---------- keys ---------- */

const USERS = "ploog:users"; // hash: id -> display name
const AUTH = "ploog:auth"; // hash: id -> password hash
const logKey = (id) => `ploog:log:${id}`; // hash: YYYY-MM-DD -> JSON entry
const friendsKey = (id) => `ploog:friends:${id}`; // set of ids
const inKey = (id) => `ploog:req:in:${id}`; // set: ids who asked to be friends
const outKey = (id) => `ploog:req:out:${id}`; // set: ids we asked
const notifKey = (id) => `ploog:notif:${id}`; // list of JSON, newest first
const seenKey = (id) => `ploog:notif:seen:${id}`; // ms timestamp of last read

/* ---------- helpers ---------- */

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

async function namesOf(ids) {
  if (!ids.length) return [];
  const names = await redis("HMGET", USERS, ...ids);
  return ids.map((id, i) => ({ id, name: names[i] || id }));
}

const NOTIF_LIMIT = 50;

async function notify(to, { type, from }) {
  const fromName = (await redis("HGET", USERS, from)) || from;
  const item = { id: crypto.randomBytes(6).toString("hex"), type, from, fromName, ts: Date.now() };
  await redis("LPUSH", notifKey(to), JSON.stringify(item));
  await redis("LTRIM", notifKey(to), 0, NOTIF_LIMIT - 1);
}

function fail(res, err) {
  console.error(err);
  res.status(500).json({ error: "database hiccup 🫠" });
}

module.exports = {
  redis, USERS, AUTH, logKey, friendsKey, inKey, outKey, notifKey, seenKey,
  cleanName, idOf, getLog, namesOf, notify, NOTIF_LIMIT, fail,
};
