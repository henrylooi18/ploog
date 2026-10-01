# ploog 💩
bowel movement tracker. track your drops. no cap.

## run it
No build step, no dependencies.

**Locally (fake in-memory database, resets on restart):**

```
node dev/server.js
```

then open http://localhost:5173.

**Against the real database (needs the Vercel CLI):**

```
vercel link
vercel env pull .env.local
vercel dev
```

## how it works
- **login**: username → password. New users create one; accounts from before passwords existed are asked to set one (their old log is kept).
- **the question**: "have you pooped today?" → yes = celebration + optional "rate the drop" vibe (and your friends get notified); no = sadness + tips.
- **calendar**: monthly view with streak, drops this month, hit rate and a rank. Days with more than one drop show `x2`, `x3`… Tap any day to edit it: add drops (up to 10) and pick a vibe for each. "+1 💩" on today's banner logs another one.
- **ploogers** (friends): add by username, see their status today + streak, and **fart 💨** at them. They get "@yourname farted at you" with a **fart back 💨** button (once per 5 min per person).
- **👑 suggested plooger**: the ploogers list suggests adding @henpoop (ploog's creator) until you add them or dismiss it with ✕. Hidden if that account doesn't exist.
- **🧾 poop report**: your current streak with the last 7 days shown as vibe tiles, your top vibe, and a few fun facts (record day, power day, all-time drops).
- **🏆 rankings**: you vs your ploogers, ranked by current streak or drops this month.
- **layout**: on wide screens (1100px+) it's report + rankings · diary · ploogers side by side; narrower screens get a bottom tab bar (diary / report / rankings / ploogers) that remembers your last tab, with a red dot for pending plooger requests.
- **🔔 notifications**: friend requests (accept inline), accepted requests, "@x just dropped one". "clear all" empties the list.
- **⚙️ settings**: change your username, or delete your account (retype your username to confirm).

## database
Upstash Redis via the Vercel Marketplace (Storage → Upstash → Redis, free tier), connected to this project.
Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the API also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

| key | type | contents |
| --- | --- | --- |
| `ploog:users` | hash | username (lowercase) → display name |
| `ploog:auth` | hash | username → `s1$<salt>$<scrypt hash>` |
| `ploog:session:<sha256(token)>` | string | username, expires after 60 days |
| `ploog:sessions:<user>` | set | that user's session hashes (to log out everywhere) |
| `ploog:log:<user>` | hash | `YYYY-MM-DD` → `{"p":1,"d":[3,0,5]}` (one vibe 1–5 per drop, 0 = none) or `{"p":0}`. Older `{"p":1,"v":3}` entries mean one drop. |
| `ploog:friends:<user>` | set | friend usernames |
| `ploog:req:in:<user>` / `ploog:req:out:<user>` | set | pending friend requests |
| `ploog:notif:<user>` | list | last 50 notifications (JSON) |
| `ploog:notif:seen:<user>` | string | ms timestamp of last read |

## API
Vercel serverless functions in `/api`. Auth is an HttpOnly, SameSite=Lax session cookie.

- `GET /api/auth`: current user `{id, name, log}` or 401
- `POST /api/auth`: `{action: "lookup" | "register" | "login" | "logout", name, password}`
- `PUT /api/log`: `{date, entry, notify}` sets a day (`entry: null` clears it)
- `GET /api/friends`: friends (with logs) + incoming/outgoing requests
- `POST /api/friends`: `{action: "request" | "accept" | "decline" | "cancel" | "remove" | "fart", name}`
- `GET /api/notifications` / `POST /api/notifications {action: "read" | "clear"}`
- `POST /api/account`: `{action: "rename", name}` or `{action: "delete", confirm}`

## security notes
- Passwords: scrypt with a random 16-byte salt per user (Node built-in `crypto`). Plaintext is never stored.
- Sessions: random 32-byte tokens; only their SHA-256 is stored.
- Login is limited to 10 failed attempts per username per 15 minutes.
- Accounts created before passwords existed can be claimed by whoever sets a password first.
- Renaming or deleting an account ends all of its sessions, so whoever registers the old name later can't inherit them.
- Usernames are the storage key, so a rename moves the user's keys and updates the plooger/request sets of everyone linked to them.

## files
- `index.html`: all screens
- `style.css`: the vibes
- `app.js`: logic, sync, calendar, friends, notifications, tabs, confetti
- `stats.js`: the poop report and the rankings
- `api/`: serverless routes (`_redis.js` and `_auth.js` are shared helpers, not routes)
- `dev/server.js`: local server with a fake Redis (not deployed)
