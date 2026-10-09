# Robocracy

Hackathon project.

## Team

| Who | Area |
|-----|------|
| Gael | Website |
| Richard | Game |

Check with the owner before changing code in their area.

## Running the game

The projector lobby, QR join, robot garage and live battle all run on one Node server: `npm install && npm start`, then open <http://localhost:3000>. See `LOBBY.md` for how it works.

## Live site (phones join through Firebase)

<https://rluo0.github.io/Robocracy/game/> is the static version on GitHub Pages, which can't run the Node server. On its setup screen, "Let the audience join" shows a QR code; people scan it, build a robot on their phone (`game/join.html`), and the robots appear in the host's lobby through the Firebase Realtime Database set in `game/src/firebase-config.js` (rules in `game/database.rules.json`). The rules have no login, so anyone with the 4-letter room code can add or remove robots in that room.

Tests: `node game/test/sim.test.mjs` and `node game/test/lobby-battle.test.mjs`.
