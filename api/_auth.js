// password hashing (scrypt) + cookie sessions. node built-ins only.

const crypto = require("crypto");
const { redis } = require("./_redis");

const COOKIE = "ploog_session";
const SESSION_DAYS = 60;
// only the sha256 of a token is stored, so a database leak can't hijack sessions
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const sessionKey = (hash) => `ploog:session:${hash}`; // -> user id
const userSessionsKey = (id) => `ploog:sessions:${id}`; // set of a user's session hashes

/* ---------- passwords ---------- */

function scrypt(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt);
  return `s1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [version, saltHex, hashHex] = String(stored).split("$");
  if (version !== "s1" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/* ---------- sessions ---------- */

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function setCookie(req, res, value, maxAge) {
  // Vercel terminates TLS, so check the forwarded proto; plain http is local dev
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

async function startSession(req, res, id) {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = hashToken(token);
  const ttl = SESSION_DAYS * 86400;
  await redis("SET", sessionKey(hash), id, "EX", ttl);
  await redis("SADD", userSessionsKey(id), hash);
  await redis("EXPIRE", userSessionsKey(id), ttl);
  setCookie(req, res, token, ttl);
}

async function endSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) {
    const hash = hashToken(token);
    const id = await redis("GET", sessionKey(hash));
    await redis("DEL", sessionKey(hash));
    if (id) await redis("SREM", userSessionsKey(id), hash);
  }
  setCookie(req, res, "", 0);
}

// logs a user out everywhere. used when their username is renamed or deleted, so that
// someone who later registers the old name can't inherit those sessions.
async function endAllSessions(id) {
  const hashes = (await redis("SMEMBERS", userSessionsKey(id))) || [];
  await redis("DEL", userSessionsKey(id), ...hashes.map(sessionKey));
}

async function sessionUser(req) {
  const token = readCookie(req, COOKIE);
  return token ? await redis("GET", sessionKey(hashToken(token))) : null;
}

// returns the user id, or sends a 401 and returns null
async function requireUser(req, res) {
  const id = await sessionUser(req);
  if (!id) res.status(401).json({ error: "log in first 🔐" });
  return id;
}

module.exports = {
  hashPassword, verifyPassword, startSession, endSession, endAllSessions, sessionUser, requireUser,
};
