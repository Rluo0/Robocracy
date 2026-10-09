# Lobby & QR join - how it works

The lobby is a Node server (Express + Socket.IO) with plain HTML/JS pages. There's no build step.

## Run it

```bash
npm install
npm start            # http://localhost:3000
```

Open `http://localhost:3000` on the projector laptop. Phones scan the QR code to join.

**Phones have to reach the laptop.** The QR code points at the laptop's LAN address (printed on startup), so phones need to be on the same Wi-Fi. If the venue Wi-Fi blocks device-to-device traffic, run a tunnel and pass its URL:

```bash
PUBLIC_URL=https://your-tunnel.example npm start
```

## Rehearse with a crowd

Open a Free For All lobby, then fill it with fake phones (they stay until Ctrl+C):

```bash
npm run fake-players -- ROOMCODE 32
```

## Pages

| Path | Who | What |
| --- | --- | --- |
| `/` | Host | Home → START → pick **Team Fight** (coming soon) or **Free For All** |
| `/host?mode=ffa` | Host (projector) | Creates a room, shows the QR code, room code, and fighters joining live. Lock entries, remove players, FIGHT! |
| `/join?room=CODE` | Phones | Name + "what are you fighting for", then live status: in lobby → fighting → won/lost |
| `/battle?room=CODE` | Host | Standalone battle for a room. Normally the battle runs inside `/host`. |

Refreshing the projector or a phone rejoins the same lobby. Rooms live in memory and are wiped when the server restarts.

## Battle (Richard's simulator)

The battle is Richard's game in `game/src`, used unchanged. `public/js/battle.js` connects it to the lobby:

- The server serves `game/` at `/game`, and the website imports `/game/src/sim.js`, `render.js` and `audio.js`.
- **Free for all:** each lobby player becomes a one-robot team. The team name is their pick, and the robot uses their name and color. Chassis and weapon come from the player id, so a player keeps the same loadout every round.
- FIGHT! runs the battle **inside the host page** instead of opening a new one. Browsers only allow sound after a click on the current page, so a new page would play the battle silently.
- When the sim declares a winner, the host reports it with `battle:result`, and phones show "YOU WON!" or "Destroyed."
- PLAY AGAIN sends `host:reset` and returns to the lobby with the same players.

Richard can change anything inside `game/`. The website only relies on `createBattle(config)`, `createRenderer(canvas, battle, { onEvent })`, `battle.result()`, and the `sfx` export from `audio.js`.

## Server API

**Get the fighters:** `GET /api/rooms/CODE`

```json
{
  "code": "K7QM",
  "mode": "ffa",
  "status": "battle",
  "locked": true,
  "winnerId": null,
  "players": [
    { "id": "uuid", "name": "Sparky", "pick": "Pizza", "color": "#ff3b6b", "connected": true }
  ]
}
```

**Report the winner** (phones then show "YOU WON!" / "Destroyed!"):

```js
const hostKey = sessionStorage.getItem(`rr-host-${code}`);
socket.emit('battle:result', { code, hostKey, winnerId }, (res) => { /* res.ok */ });
```

**Another round** with the same players: `socket.emit('host:reset', { code, hostKey })`.
