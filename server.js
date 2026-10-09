// ROBOT ROYALE lobby server: rooms, QR join codes, and the hand-off to the battle.
// Rooms live in memory, so restarting the server clears every lobby.

const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = 60;
const MAX_NAME = 16;
const MAX_PICK = 32;

// Room codes skip look-alike characters (0/O, 1/I/L) so they are easy to read off a projector.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROBOT_COLORS = ['#ff4f7b', '#ffd23f', '#3ee6a8', '#4fb0ff', '#c084fc', '#ff8a3d', '#a3e635', '#22d3ee'];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {{ id: string, name: string, pick: string, color: string, connected: boolean, socketId: string|null }} Player
 * @typedef {{ code: string, mode: 'ffa'|'teams', hostKey: string, status: 'lobby'|'battle'|'results',
 *             locked: boolean, players: Map<string, Player>, winnerId: string|null, createdAt: number }} Room
 */

// The QR code has to point at an address phones can reach, never "localhost".
// PUBLIC_URL wins (use it for a tunnel or deployed host); otherwise guess the LAN address.
function lanAddress() {
  const skip = /vethernet|vmware|virtualbox|loopback|wsl|hyper-v|docker|bluetooth/i;
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) candidates.push(a.address);
    }
  }
  return candidates[0] || 'localhost';
}

function publicBaseUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  return `http://${lanAddress()}:${PORT}`;
}

function newRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    status: room.status,
    locked: room.locked,
    winnerId: room.winnerId,
    players: [...room.players.values()].map(({ id, name, pick, color, connected }) => ({ id, name, pick, color, connected })),
  };
}

function broadcast(room) {
  io.to(room.code).emit('room:update', publicRoom(room));
}

function hostRoom(code, hostKey) {
  const room = rooms.get(String(code || '').toUpperCase());
  return room && room.hostKey === hostKey ? room : null;
}

function clean(text, max) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function joinInfo(room) {
  const joinUrl = `${publicBaseUrl()}/join?room=${room.code}`;
  const qr = await QRCode.toDataURL(joinUrl, { margin: 1, width: 640, errorCorrectionLevel: 'M' });
  return { joinUrl, qr };
}

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
// The battle simulator (game/) is a static ES-module app; battle.html loads it from /game.
app.use('/game', express.static(path.join(__dirname, 'game')));

// Fonts and icons are served locally so the demo still looks right on venue Wi-Fi with no internet.
const vendor = {
  phosphor: '@phosphor-icons/web/src',
  'font-display': '@fontsource/dela-gothic-one',
  'font-body': '@fontsource-variable/bricolage-grotesque',
};
for (const [route, pkg] of Object.entries(vendor)) {
  app.use(`/vendor/${route}`, express.static(path.join(__dirname, 'node_modules', pkg), { maxAge: '7d' }));
}

// Read-only snapshot for the battle screen (Richard's simulator).
app.get('/api/rooms/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(publicRoom(room));
});

io.on('connection', (socket) => {
  // ---------- Host ----------
  socket.on('host:create', async ({ mode } = {}, ack) => {
    if (mode !== 'ffa' && mode !== 'teams') return ack?.({ ok: false, error: 'Unknown mode' });
    const room = {
      code: newRoomCode(),
      mode,
      hostKey: crypto.randomUUID(),
      status: 'lobby',
      locked: false,
      players: new Map(),
      winnerId: null,
      createdAt: Date.now(),
    };
    rooms.set(room.code, room);
    socket.join(room.code);
    ack?.({ ok: true, hostKey: room.hostKey, room: publicRoom(room), ...(await joinInfo(room)) });
  });

  // Lets the projector page refresh without losing the lobby.
  socket.on('host:resume', async ({ code, hostKey } = {}, ack) => {
    const room = hostRoom(code, hostKey);
    if (!room) return ack?.({ ok: false, error: 'Room not found' });
    socket.join(room.code);
    ack?.({ ok: true, room: publicRoom(room), ...(await joinInfo(room)) });
  });

  socket.on('host:lock', ({ code, hostKey, locked } = {}) => {
    const room = hostRoom(code, hostKey);
    if (!room || room.status !== 'lobby') return;
    room.locked = Boolean(locked);
    broadcast(room);
  });

  socket.on('host:kick', ({ code, hostKey, playerId } = {}) => {
    const room = hostRoom(code, hostKey);
    const player = room?.players.get(playerId);
    if (!player) return;
    room.players.delete(playerId);
    if (player.socketId) {
      io.to(player.socketId).emit('player:kicked');
      io.sockets.sockets.get(player.socketId)?.leave(room.code);
    }
    broadcast(room);
  });

  socket.on('host:start', ({ code, hostKey } = {}, ack) => {
    const room = hostRoom(code, hostKey);
    if (!room) return ack?.({ ok: false, error: 'Room not found' });
    if (room.players.size < 2) return ack?.({ ok: false, error: 'Need at least 2 fighters' });
    room.status = 'battle';
    room.locked = true;
    room.winnerId = null;
    broadcast(room);
    io.to(room.code).emit('battle:start', publicRoom(room));
    ack?.({ ok: true });
  });

  // The battle screen reports the winner here; phones then show the result.
  socket.on('battle:result', ({ code, hostKey, winnerId } = {}, ack) => {
    const room = hostRoom(code, hostKey);
    if (!room || !room.players.has(winnerId)) return ack?.({ ok: false, error: 'Unknown room or winner' });
    room.status = 'results';
    room.winnerId = winnerId;
    broadcast(room);
    ack?.({ ok: true });
  });

  // Back to the lobby with the same players, for another round.
  socket.on('host:reset', ({ code, hostKey } = {}) => {
    const room = hostRoom(code, hostKey);
    if (!room) return;
    room.status = 'lobby';
    room.locked = false;
    room.winnerId = null;
    broadcast(room);
  });

  // ---------- Player ----------
  socket.on('player:join', ({ code, name, pick, playerId } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return ack?.({ ok: false, error: "That room code doesn't exist." });

    // Returning phone (screen slept, page refreshed): reattach to the same fighter.
    const existing = playerId && room.players.get(playerId);
    if (existing) {
      existing.connected = true;
      existing.socketId = socket.id;
      socket.data = { code: room.code, playerId: existing.id };
      socket.join(room.code);
      broadcast(room);
      return ack?.({ ok: true, player: existing, room: publicRoom(room) });
    }

    if (room.locked || room.status !== 'lobby') return ack?.({ ok: false, error: 'Entries are closed for this battle.' });
    if (room.players.size >= MAX_PLAYERS) return ack?.({ ok: false, error: 'The arena is full.' });

    const cleanName = clean(name, MAX_NAME);
    const cleanPick = clean(pick, MAX_PICK);
    if (!cleanName) return ack?.({ ok: false, error: 'Enter a name.' });
    if (!cleanPick) return ack?.({ ok: false, error: "Enter what you're fighting for." });
    const taken = [...room.players.values()].some((p) => p.name.toLowerCase() === cleanName.toLowerCase());
    if (taken) return ack?.({ ok: false, error: 'That name is taken. Try another.' });

    const player = {
      id: crypto.randomUUID(),
      name: cleanName,
      pick: cleanPick,
      color: ROBOT_COLORS[room.players.size % ROBOT_COLORS.length],
      connected: true,
      socketId: socket.id,
    };
    room.players.set(player.id, player);
    socket.data = { code: room.code, playerId: player.id };
    socket.join(room.code);
    broadcast(room);
    ack?.({ ok: true, player, room: publicRoom(room) });
  });

  socket.on('player:leave', () => {
    const { code, playerId } = socket.data || {};
    const room = rooms.get(code);
    if (!room || room.status !== 'lobby') return;
    room.players.delete(playerId);
    socket.leave(code);
    socket.data = {};
    broadcast(room);
  });

  socket.on('disconnect', () => {
    const { code, playerId } = socket.data || {};
    const player = rooms.get(code)?.players.get(playerId);
    if (!player || player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    broadcast(rooms.get(code));
  });
});

// Drop lobbies older than 6 hours so a long-running server doesn't pile them up.
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [code, room] of rooms) if (room.createdAt < cutoff) rooms.delete(code);
}, 30 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`ROBOT ROYALE running on http://localhost:${PORT}`);
  console.log(`Phones will join via ${publicBaseUrl()}  (set PUBLIC_URL to override)`);
});
