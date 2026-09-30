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
- **calendar**: monthly view with streak, monthly count, hit rate and a rank. Tap any past day to edit it.
- **ploogers** (friends): add by username, see their status today + streak.
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
| `ploog:log:<user>` | hash | `YYYY-MM-DD` → `{"p":1,"v":3}` (`p` = pooped, `v` = vibe 1–5) |
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
- `POST /api/friends`: `{action: "request" | "accept" | "decline" | "cancel" | "remove", name}`
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
- `app.js`: logic, sync, calendar, friends, notifications, confetti
- `api/`: serverless routes (`_redis.js` and `_auth.js` are shared helpers, not routes)
- `dev/server.js`: local server with a fake Redis (not deployed)
