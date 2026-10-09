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

## Pages

| Path | Who | What |
| --- | --- | --- |
| `/` | Host | Home → START → pick **Team Fight** (coming soon) or **Free For All** |
| `/host?mode=ffa` | Host (projector) | Creates a room, shows the QR code, room code, and fighters joining live. Lock entries, remove players, FIGHT! |
| `/join?room=CODE` | Phones | Name + "what are you fighting for", then live status: in lobby → fighting → won/lost |
| `/battle?room=CODE` | Host | The real robot battle (`game/` simulator): each player becomes a robot, fights, and the winner is reported to the phones. Code: `public/battle.html` + `game/src/lobby-battle.js`; players to robots in `game/src/fighters.js` |

Refreshing the projector or a phone rejoins the same lobby. Rooms live in memory and are wiped when the server restarts.

## Battle hand-off contract (for Richard)

When the host presses FIGHT!, the server sets the room to `status: "battle"`, locks entries, and the host page navigates to `/battle?room=CODE`.

**Get the fighters:** `GET /api/rooms/CODE`

```json
{
  "code": "K7QM",
  "mode": "ffa",
  "status": "battle",
  "locked": true,
  "winnerId": null,
  "players": [
    { "id": "uuid", "name": "Sparky", "pick": "Pizza", "color": "#ff3b6b", "connected": true,
      "robot": { "name": "Sparky", "owner": "Sam", "cry": "For Pizza!", "color": "#ff3b6b", "accent": "#ffffff",
                 "chassis": "tank", "weapon": "blaster", "eyes": "twin", "hat": "none", "pattern": "plain" } }
  ]
}
```

**Report the winner** (phones then show "YOU WON!" / "Destroyed!"):

```js
const hostKey = sessionStorage.getItem(`rr-host-${code}`);
socket.emit('battle:result', { code, hostKey, winnerId }, (res) => { /* res.ok */ });
```

**Another round** with the same players: `socket.emit('host:reset', { code, hostKey })`, then go to `/host?room=CODE`.

**Robots:** each player carries a `robot` (`name, owner, cry, color, accent, chassis, weapon, eyes, hat, pattern`), cleaned on the server by `sanitizeRobot()` in `game/src/robot.js`. Phones send it with `player:join` as `{ code, name, pick, playerId?, robot? }` (a random robot is used if it's missing), and can rebuild it any time before the fight with `player:robot`:

```js
socket.emit('player:robot', { robot }, (res) => { /* { ok: true, player } or { ok: false, error } */ });
```

It only works while the room is in the lobby; after FIGHT! it answers `{ ok: false, error: 'The battle has already started.' }`. The server forces `owner` to the player's name and keeps `player.color` equal to the robot's paint. Acks and `room:update` carry players as `{ id, name, pick, color, connected, robot }`.

The battle page implements the three host calls in `game/src/lobby-battle.js` (the server serves `game/` at `/game`). Each player fights with their own `robot`; only a player with no robot gets a chassis, weapon and looks derived from their id (the same player looks the same every round). Free For All gives one team per player; Team Fight groups players by what they picked. Only the three calls above need to stay if you replace the page.
