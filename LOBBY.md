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
| `/battle?room=CODE` | Host | **Placeholder for Richard's simulator** |

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
    { "id": "uuid", "name": "Sparky", "pick": "Pizza", "color": "#ff3b6b", "connected": true }
  ]
}
```

**Report the winner** (phones then show "YOU WON!" / "Destroyed!"):

```js
const hostKey = sessionStorage.getItem(`rr-host-${code}`);
socket.emit('battle:result', { code, hostKey, winnerId }, (res) => { /* res.ok */ });
```

**Another round** with the same players: `socket.emit('host:reset', { code, hostKey })`, then go to `/host?room=CODE`.

Replace `public/battle.html` however you like. Only the three calls above need to stay.
