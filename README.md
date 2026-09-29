# ploog 💩
bowel movement tracker. track your drops. no cap.

## run it
No build step, no dependencies.

**Frontend only (offline mode, data saved in the browser):**

```
python -m http.server 5173
```

**With the database (needs the Vercel CLI):**

```
vercel link
vercel env pull .env.local
vercel dev
```

## database
Upstash Redis via the Vercel Marketplace (Storage → Upstash → Redis, free tier), connected to this project.
Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the API also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

- `ploog:users`: hash of `username (lowercase) -> display name`
- `ploog:log:<username>`: hash of `YYYY-MM-DD -> {"p":1,"v":3}` (`p` = pooped, `v` = vibe 1–5)

API (`/api`, Vercel serverless functions):
- `POST /api/login {name}`: creates the user if new, returns `{id, name, log}`
- `GET /api/log?u=<id>`: returns `{log}`
- `PUT /api/log {u, date, entry}`: sets a day (`entry: null` clears it)

⚠️ No passwords by design: anyone who types a username can see and edit that user's log.

## how it works
- **login**: username only, no password. Multiple users can share a device.
- **the question**: "have you pooped today?" → yes = celebration + optional "rate the drop" vibe; no = sadness + tips.
- **calendar**: monthly view with streak, monthly count, hit rate and a rank. Tap any past day to edit it.

The server is the source of truth. `localStorage` (key `ploog:v1`) caches it so the page loads instantly and keeps working offline.

## files
- `index.html`: all screens
- `style.css`: the vibes
- `app.js`: logic, sync, calendar, confetti
- `api/`: serverless routes + tiny Redis REST client
