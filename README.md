# Robocracy

Hackathon project.

## Team

| Who | Area |
|-----|------|
| Gael | Website |
| Richard | Game |

Check with the owner before changing code in their area.

## Audience join (QR code)

On the game's setup screen, "Let the audience join" shows a QR code. People scan it, build a robot on their phone
(`game/join.html`), and the robots appear in the host's lobby. The battle runs only on the host's screen.

Until Firebase is configured it runs in local test mode: only other tabs in the same browser can join.

To make it work for real phones:

1. Create a project at <https://console.firebase.google.com> and add a Realtime Database to it.
2. Paste the contents of `game/database.rules.json` into the database's Rules tab and publish.
3. Add a web app to the project (Project settings → Your apps) and paste its config into `game/src/firebase-config.js`.
   It needs `apiKey` and `databaseURL` at minimum.
4. Host the `game/` folder on a public URL (GitHub Pages, Netlify, Vercel). Phones can't reach `localhost`.

The rules have no login, so anyone with the 4-letter room code can add or remove robots in that room.

## Lobby server

The projector lobby, QR join and live battle run on a Node server: `npm install && npm start`, then open <http://localhost:3000>. See `LOBBY.md`.
