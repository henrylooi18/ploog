// delete ploog accounts straight from the database (admin use).
//
//   node dev/delete-users.js asd test              -> dry run: shows what would be deleted
//   node dev/delete-users.js asd test --confirm    -> actually deletes
//
// needs the database env vars. for the real database run `vercel env pull .env.local` first;
// this script reads .env.local if the vars aren't already set.
// same cleanup as "delete my account" and the admin page. handy before an admin account exists.

const fs = require("fs");
const path = require("path");

// load .env.local (KEY="value" lines) before the helpers read process.env
const envFile = path.join(__dirname, "..", ".env.local");
if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const { redis, USERS, logKey, friendsKey, inKey, outKey, idOf } = require("../api/_redis");
const { deleteAccount } = require("../api/_accounts");

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const ids = [...new Set(args.filter((a) => !a.startsWith("--")).map(idOf).filter(Boolean))];

async function deleteUser(id) {
  if (!(await redis("HEXISTS", USERS, id))) {
    console.log(`@${id}: no such user, skipping`);
    return;
  }
  const [days, friends, incoming, outgoing] = await Promise.all([
    redis("HLEN", logKey(id)),
    redis("SCARD", friendsKey(id)),
    redis("SCARD", inKey(id)),
    redis("SCARD", outKey(id)),
  ]);
  console.log(`@${id}: ${days} logged days, ${friends} ploogers, ${incoming + outgoing} pending requests`);
  if (!confirm) return;
  await deleteAccount(id);
  console.log(`@${id}: deleted ✅`);
}

(async () => {
  if (!ids.length) {
    console.log("usage: node dev/delete-users.js <username> [...more] [--confirm]");
    process.exit(1);
  }
  console.log(confirm ? "DELETING for real:\n" : "dry run (nothing changes; add --confirm to delete):\n");
  for (const id of ids) await deleteUser(id);
})().catch((err) => {
  console.error("failed:", err.message);
  process.exit(1);
});
