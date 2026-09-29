# ploog 💩
bowel movement tracker. track your drops. no cap.

## run it
No build step. Serve the folder with any static server, e.g.:

```
python -m http.server 5173
```

then open http://localhost:5173.

## how it works
- **login**: username only, no password. Multiple users can share a device.
- **the question**: "have you pooped today?" → yes = celebration + optional "rate the drop" vibe; no = sadness + tips.
- **calendar**: monthly view with streak, monthly count, hit rate and a rank. Tap any past day to edit it.

Data is stored in `localStorage` (key `ploog:v1`) on the user's device. Nothing leaves the browser.

## files
- `index.html`: all screens
- `style.css`: the vibes
- `app.js`: logic, storage, calendar, confetti
