// Fills a lobby with fake phones for rehearsals and load tests.
// Usage: npm run fake-players -- <ROOM> [count=32] [url=http://localhost:3000] [delayMs=120]
// Players stay connected until you press Ctrl+C.
const { io } = require('socket.io-client');

const [room, count = '32', url = 'http://localhost:3000', delay = '120'] = process.argv.slice(2);
if (!room) {
  console.error('Usage: npm run fake-players -- <ROOM> [count] [url] [delayMs]');
  process.exit(1);
}

const NAMES = ['Sparky', 'Bolt', 'Gizmo', 'Rusty', 'Clank', 'Widget', 'Fuse', 'Dynamo', 'Ratchet', 'Servo', 'Piston', 'Cog',
  'Volt', 'Zapper', 'Tinker', 'Gadget', 'Scrap', 'Rivet', 'Turbo', 'Blip', 'Chip', 'Dent', 'Glitch', 'Nova', 'Pixel', 'Rotor',
  'Sprocket', 'Torque', 'Ziggy', 'Boomer', 'Crank', 'Flux', 'Gears', 'Hex', 'Jolt', 'Kilo', 'Laser', 'Mega', 'Nuts', 'Ohm'];
const PICKS = ['Pizza', 'Tacos', 'Sushi', 'Ramen', 'Burgers', 'Pho', 'Dumplings', 'Wings', 'Shawarma', 'Curry', 'Poutine',
  'BBQ', 'Pad Thai', 'Bibimbap', 'Nachos', 'Gelato', 'Waffles', 'Kebab', 'Falafel', 'Hot pot', 'Fish and chips', 'Tapas'];

const sockets = [];
let joined = 0;

(async () => {
  for (let i = 0; i < Number(count); i++) {
    const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? Math.floor(i / NAMES.length) + 1 : ''}`;
    const pick = PICKS[Math.floor(Math.random() * PICKS.length)];
    const socket = io(url, { transports: ['websocket'] });
    sockets.push(socket);
    socket.emit('player:join', { code: room, name, pick }, (res) => {
      if (res.ok) joined++;
      else console.log(`${name}: ${res.error}`);
    });
    await new Promise((r) => setTimeout(r, Number(delay)));
  }
  setTimeout(() => console.log(`${joined}/${count} fake players in room ${room.toUpperCase()}. Ctrl+C to remove them.`), 500);
})();

process.on('SIGINT', () => {
  sockets.forEach((s) => s.close());
  process.exit(0);
});
