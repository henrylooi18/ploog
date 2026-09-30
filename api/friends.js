// GET  /api/friends -> { friends: [{ id, name, log }], incoming: [{ id, name }], outgoing: [{ id, name }] }
// POST /api/friends { action, name } -> { status }
//   request: send a friend request (auto-accepts if they already asked you)
//   accept | decline: answer an incoming request
//   cancel: withdraw an outgoing request
//   remove: unfriend
//   fart: fart at a plooger 💨 (once per 5 min per direction, so they can fart back)

const {
  redis, USERS, friendsKey, inKey, outKey, idOf, getLog, namesOf, notify, fail,
} = require("./_redis");
const { requireUser } = require("./_auth");

async function befriend(me, them) {
  await Promise.all([
    redis("SADD", friendsKey(me), them),
    redis("SADD", friendsKey(them), me),
    redis("SREM", inKey(me), them),
    redis("SREM", outKey(me), them),
    redis("SREM", inKey(them), me),
    redis("SREM", outKey(them), me),
  ]);
}

module.exports = async (req, res) => {
  try {
    const me = await requireUser(req, res);
    if (!me) return;

    if (req.method === "GET") {
      const [friendIds, inIds, outIds] = await Promise.all([
        redis("SMEMBERS", friendsKey(me)),
        redis("SMEMBERS", inKey(me)),
        redis("SMEMBERS", outKey(me)),
      ]);
      const [friends, incoming, outgoing] = await Promise.all([
        namesOf(friendIds || []), namesOf(inIds || []), namesOf(outIds || []),
      ]);
      const logs = await Promise.all(friends.map((f) => getLog(f.id)));
      friends.forEach((f, i) => (f.log = logs[i]));
      return res.status(200).json({ friends, incoming, outgoing });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

    const { action } = req.body || {};
    const them = idOf(req.body && req.body.name);
    if (!them) return res.status(400).json({ error: "username required" });
    if (them === me) return res.status(400).json({ error: "you can't friend yourself bestie 😭" });
    if (!(await redis("HEXISTS", USERS, them))) return res.status(404).json({ error: "no one goes by that name 👻" });

    const areFriends = await redis("SISMEMBER", friendsKey(me), them);

    switch (action) {
      case "request": {
        if (areFriends) return res.status(200).json({ status: "friends" });
        if (await redis("SISMEMBER", inKey(me), them)) {
          await befriend(me, them);
          await notify(them, { type: "friend_accept", from: me });
          return res.status(200).json({ status: "friends" });
        }
        const added = await redis("SADD", outKey(me), them);
        await redis("SADD", inKey(them), me);
        if (added) await notify(them, { type: "friend_request", from: me });
        return res.status(200).json({ status: "requested" });
      }
      case "accept": {
        if (!(await redis("SISMEMBER", inKey(me), them))) return res.status(404).json({ error: "no request from them" });
        await befriend(me, them);
        await notify(them, { type: "friend_accept", from: me });
        return res.status(200).json({ status: "friends" });
      }
      case "decline":
      case "cancel": {
        const [a, b] = action === "decline" ? [inKey(me), outKey(them)] : [outKey(me), inKey(them)];
        await Promise.all([redis("SREM", a, them), redis("SREM", b, me)]);
        return res.status(200).json({ status: "none" });
      }
      case "remove": {
        await Promise.all([redis("SREM", friendsKey(me), them), redis("SREM", friendsKey(them), me)]);
        return res.status(200).json({ status: "none" });
      }
      case "fart": {
        if (!areFriends) return res.status(403).json({ error: "you can only fart at ploogers 💨" });
        const fresh = await redis("SET", `ploog:fart:${me}:${them}`, 1, "NX", "EX", 300);
        if (!fresh) return res.status(429).json({ error: "you're out of gas. try again in a few min 💨" });
        await notify(them, { type: "fart", from: me });
        return res.status(200).json({ status: "farted" });
      }
      default:
        return res.status(400).json({ error: "unknown action" });
    }
  } catch (err) {
    fail(res, err);
  }
};
