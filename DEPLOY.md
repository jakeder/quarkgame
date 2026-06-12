# Deploying Qwazy Quarks to Firebase Hosting

The game is a static site (HTML/CSS/JS) that talks to Firebase Realtime
Database for online play. Hosting it on Firebase gives you a public URL and
makes it installable as a standalone app.

## One-time setup

1. **Install the Firebase CLI** (needs Node.js):
   ```
   npm install -g firebase-tools
   ```

2. **Log in:**
   ```
   firebase login
   ```

3. **Point this project at your Firebase project.** Either edit `.firebaserc`
   and replace `YOUR_FIREBASE_PROJECT_ID` with your project ID (find it in the
   Firebase Console → Project settings), or run:
   ```
   firebase use --add
   ```
   and pick your project.

## Deploy

From the repo root:
```
firebase deploy --only hosting
```
The CLI prints your live URLs, e.g. `https://your-project.web.app`.

## Config — you do NOT need to ship firebase-config.js

When the app is served from Firebase Hosting on the **same** project as your
Realtime Database, Firebase auto-serves the config at `/__/firebase/init.json`,
and `multiplayer.js` falls back to it automatically. So the deployed app finds
its config with no extra files.

For **local development** (`python3 -m http.server`), that auto path doesn't
exist, so copy `firebase-config.example.js` to `firebase-config.js` and fill in
your values. `firebase-config.js` is gitignored and excluded from the deploy.

## Database rules

Online play needs the Realtime Database to allow reads/writes under `rooms`.
In Firebase Console → Realtime Database → Rules:
```json
{
  "rules": {
    "rooms": { ".read": true, ".write": true }
  }
}
```
This is the friends-trust model. Tighten later with per-player rules if needed.

## Updating

Just re-run `firebase deploy --only hosting` after pushing changes. The service
worker is set to `no-cache` and uses a network-first strategy, so players get
the latest version on their next online load.
