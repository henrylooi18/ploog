// local dev server: static files + /api routes + an in-memory fake of Upstash's REST API.
// no Vercel account or real database needed. data resets when the server restarts.
//   node dev/server.js   ->   http://localhost:5173

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 5173;
const ROOT = path.join(__dirname, "..");

process.env.KV_REST_API_URL = `http://localhost:${PORT}/__redis`;
process.env.KV_REST_API_TOKEN = "dev";

/* ---------- fake redis ---------- */

const data = new Map(); // key -> string | Map (hash) | Set | Array (list)
const expiry = new Map(); // key -> ms timestamp

function get(key) {
  if (expiry.has(key) && expiry.get(key) <= Date.now()) {
    data.delete(key);
    expiry.delete(key);
  }
  return data.get(key);
}
const of = (key, Type) => {
  let v = get(key);
  if (!v) data.set(key, (v = new Type()));
  return v;
};

const commands = {
  GET: (k) => get(k) ?? null,
  MGET: (...ks) => ks.map((k) => (typeof get(k) === "string" ? get(k) : null)),
  // returns every match in one page (cursor "0" = done); fine for a dev-sized dataset
  SCAN: (cursor, ...opts) => {
    const i = opts.findIndex((o) => String(o).toUpperCase() === "MATCH");
    const re = new RegExp(`^${(i >= 0 ? opts[i + 1] : "*").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return ["0", [...data.keys()].filter((k) => get(k) !== undefined && re.test(k))];
  },
  SET: (k, v, ...opts) => {
    const up = opts.map((o) => String(o).toUpperCase());
    if (up.includes("NX") && get(k) !== undefined) return null;
    data.set(k, String(v));
    expiry.delete(k);
    const ex = up.indexOf("EX");
    if (ex >= 0) expiry.set(k, Date.now() + Number(opts[ex + 1]) * 1000);
    return "OK";
  },
  DEL: (...ks) => ks.filter((k) => get(k) !== undefined && data.delete(k)).length,
  EXISTS: (...ks) => ks.filter((k) => get(k) !== undefined).length,
  RENAME: (from, to) => {
    const v = get(from);
    if (v === undefined) throw new Error("ERR no such key");
    data.set(to, v);
    data.delete(from);
    if (expiry.has(from)) expiry.set(to, expiry.get(from));
    else expiry.delete(to);
    expiry.delete(from);
    return "OK";
  },
  INCR: (k) => {
    const n = (Number(get(k)) || 0) + 1;
    data.set(k, String(n));
    return n;
  },
  EXPIRE: (k, s) => (get(k) === undefined ? 0 : (expiry.set(k, Date.now() + s * 1000), 1)),
  HGET: (k, f) => get(k)?.get(f) ?? null,
  HMGET: (k, ...fs) => fs.map((f) => get(k)?.get(f) ?? null),
  HSET: (k, f, v) => {
    const h = of(k, Map), isNew = !h.has(f);
    h.set(f, String(v));
    return isNew ? 1 : 0;
  },
  HSETNX: (k, f, v) => (of(k, Map).has(f) ? 0 : (get(k).set(f, String(v)), 1)),
  HDEL: (k, ...fs) => fs.filter((f) => get(k)?.delete(f)).length,
  HEXISTS: (k, f) => (get(k)?.has(f) ? 1 : 0),
  HLEN: (k) => get(k)?.size ?? 0,
  HKEYS: (k) => [...(get(k)?.keys() || [])],
  HGETALL: (k) => [...(get(k) || new Map())].flat(),
  SADD: (k, ...ms) => ms.filter((m) => !of(k, Set).has(m) && get(k).add(m)).length,
  SREM: (k, ...ms) => ms.filter((m) => get(k)?.delete(m)).length,
  SMEMBERS: (k) => [...(get(k) || [])],
  SISMEMBER: (k, m) => (get(k)?.has(m) ? 1 : 0),
  SCARD: (k) => get(k)?.size ?? 0,
  LPUSH: (k, ...vs) => {
    const l = of(k, Array);
    vs.forEach((v) => l.unshift(String(v)));
    return l.length;
  },
  LRANGE: (k, a, b) => (get(k) || []).slice(a, b === -1 ? undefined : b + 1),
  LTRIM: (k, a, b) => {
    const l = get(k);
    if (l) data.set(k, l.slice(a, b === -1 ? undefined : b + 1));
    return "OK";
  },
};

/* ---------- http ---------- */

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : undefined); } catch { resolve(undefined); }
    });
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.status = (code) => ((res.statusCode = code), res);
    res.json = (obj) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
    };

    if (url.pathname === "/__redis") {
      const [cmd, ...args] = (await readBody(req)) || [];
      const fn = commands[String(cmd).toUpperCase()];
      if (!fn) return res.status(400).json({ error: `fake redis doesn't know ${cmd}` });
      try {
        return res.json({ result: fn(...args) });
      } catch (err) {
        return res.status(400).json({ error: err.message }); // same shape as Upstash errors
      }
    }

    const route = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (route) {
      const file = path.join(ROOT, "api", `${route[1]}.js`);
      if (!fs.existsSync(file)) return res.status(404).json({ error: "no such route" });
      req.query = Object.fromEntries(url.searchParams);
      req.body = await readBody(req);
      try {
        return await require(file)(req, res);
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: String(err) });
      }
    }

    const file = path.join(ROOT, url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end("not found");
    }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`ploog dev server → http://localhost:${PORT}`));
