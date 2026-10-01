// shared account plumbing: who links to a user, and deleting a user completely.
// used by "delete my account" (api/account.js), the admin page (api/admin.js) and dev/delete-users.js.

const {
  redis, USERS, JOINED, AUTH, logKey, friendsKey, inKey, outKey, notifKey, seenKey,
} = require("./_redis");
const { endAllSessions } = require("./_auth");

// every key that belongs to one user (besides their fields in the USERS / AUTH hashes)
const ownKeys = (id) => [logKey(id), friendsKey(id), inKey(id), outKey(id), notifKey(id), seenKey(id)];

// sets in other accounts that contain `id`
async function references(id) {
  const [friends, incoming, outgoing] = await Promise.all([
    redis("SMEMBERS", friendsKey(id)),
    redis("SMEMBERS", inKey(id)),
    redis("SMEMBERS", outKey(id)),
  ]);
  return [
    ...(friends || []).map(friendsKey),
    ...(incoming || []).map(outKey), // they asked us: we're in their outgoing
    ...(outgoing || []).map(inKey), // we asked them: we're in their incoming
  ];
}

// sessions from before the per-user session index existed aren't in ploog:sessions:<id>,
// so sweep every session key and drop the ones that belong to this user
async function sweepSessions(id) {
  let cursor = "0";
  do {
    const [next, keys] = await redis("SCAN", cursor, "MATCH", "ploog:session:*", "COUNT", 500);
    cursor = String(next);
    const owners = keys.length ? await redis("MGET", ...keys) : [];
    const mine = keys.filter((_, i) => owners[i] === id);
    if (mine.length) await redis("DEL", ...mine);
  } while (cursor !== "0");
}

// removes the user, their data, their place in everyone else's lists, and every login session,
// so someone who signs up with the same name later starts completely fresh
async function deleteAccount(id) {
  const refs = await references(id);
  await Promise.all(refs.map((key) => redis("SREM", key, id)));
  await endAllSessions(id);
  await sweepSessions(id);
  await redis("DEL", ...ownKeys(id));
  await Promise.all([redis("HDEL", AUTH, id), redis("HDEL", USERS, id), redis("HDEL", JOINED, id)]);
}

module.exports = { ownKeys, references, deleteAccount };
