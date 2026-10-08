// Deterministic battle simulation. No DOM, no Math.random: everything random
// comes from the seeded rng, so the same config + seed gives the same fight.
import { makeRng } from './rng.js';

export const TILE = 24, COLS = 40, ROWS = 26;
export const W = COLS * TILE, H = ROWS * TILE;
export const DT = 1 / 60;
export const EMPTY = 0, WALL = 1, CRATE = 2, BARREL = 3, STEEL = 4;
export const TILE_HP = { [WALL]: 40, [CRATE]: 14, [BARREL]: 6, [STEEL]: Infinity };

const TAU = Math.PI * 2;
const SUDDEN_AT = 45;
const MAX_LAVA = Math.ceil(Math.min(COLS, ROWS) / 2);

export const CHASSIS = {
  tank: { label: 'Tank', hp: 1.3, speed: 0.8, dmg: 1, armor: 0.08, r: 15 },
  scout: { label: 'Scout', hp: 0.8, speed: 1.3, dmg: 1, armor: 0, r: 11 },
  brawler: { label: 'Brawler', hp: 1, speed: 1, dmg: 1.15, armor: 0.03, r: 13 },
};

export const WEAPONS = {
  blaster: { label: 'Blaster', cd: 0.32, dmg: 8, speed: 520, range: 330, spread: 0.06 },
  scatter: { label: 'Scattergun', cd: 0.95, dmg: 6.5, pellets: 6, speed: 470, range: 200, spread: 0.4 },
  rocket: { label: 'Rockets', cd: 1.6, dmg: 24, speed: 270, range: 380, spread: 0.03, blast: 54 },
  rail: { label: 'Railgun', cd: 2.3, dmg: 27, range: 520, hitscan: true },
  saw: { label: 'Buzzsaw', cd: 0.1, dmg: 6, range: 0, melee: true },
};

export const POWERUPS = {
  repair: { label: 'Repair', icon: '🔧', color: '#4ade80' },
  overdrive: { label: 'Overdrive', icon: '⚡', color: '#facc15' },
  shield: { label: 'Shield', icon: '🛡️', color: '#38bdf8' },
  haste: { label: 'Haste', icon: '💨', color: '#f0abfc' },
  giant: { label: 'Giant', icon: '🍄', color: '#fb923c' },
  nuke: { label: 'Nuke', icon: '☢️', color: '#f87171' },
  shuffle: { label: 'Shuffle', icon: '🌀', color: '#c084fc' },
  airstrike: { label: 'Airstrike', icon: '🚀', color: '#fda4af' },
};
const POWERUP_KEYS = Object.keys(POWERUPS);

export const layerOf = (cx, cy) => Math.min(cx, cy, COLS - 1 - cx, ROWS - 1 - cy);

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// config: { seed, teams: [{id, name, color}], robots: [{name, team, color, chassis, weapon}] }
export function createBattle(config) {
  const rng = makeRng(config.seed ?? 1);
  const rand = (a, b) => a + rng() * (b - a);
  const irand = (n) => Math.floor(rng() * n);

  const tiles = new Uint8Array(COLS * ROWS);
  const tileHp = new Float32Array(COLS * ROWS);
  const teams = config.teams.filter((t) => config.robots.some((r) => r.team === t.id));
  const s = {
    t: 0, tiles, tileHp, teams,
    bots: [], shots: [], powerups: [], meteors: [], pending: [],
    lava: 0, sudden: false, events: [], over: false, winner: null,
  };
  let nextDrop = 2, nextEvent = 5, nextLava = 0, lastDead = null;
  const ev = (e) => s.events.push(e);
  const rad = (b) => b.baseR * (b.fx.giant > 0 ? 1.6 : 1);

  // ---------- map ----------
  const idx = (cx, cy) => cy * COLS + cx;
  const inside = (cx, cy) => cx > 0 && cy > 0 && cx < COLS - 1 && cy < ROWS - 1;
  const tileAt = (cx, cy) => (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS ? STEEL : tiles[idx(cx, cy)]);
  function setTile(cx, cy, type) {
    tiles[idx(cx, cy)] = type;
    tileHp[idx(cx, cy)] = type === EMPTY ? 0 : TILE_HP[type];
  }

  for (let cy = 0; cy < ROWS; cy++)
    for (let cx = 0; cx < COLS; cx++) if (!inside(cx, cy)) setTile(cx, cy, STEEL);
  // Build one quadrant and mirror it so no side gets a better map.
  const mirror = (cx, cy, type) => {
    for (const [x, y] of [[cx, cy], [COLS - 1 - cx, cy], [cx, ROWS - 1 - cy], [COLS - 1 - cx, ROWS - 1 - cy]])
      if (inside(x, y)) setTile(x, y, type);
  };
  const qx = () => 1 + irand(COLS / 2 - 1), qy = () => 1 + irand(ROWS / 2 - 1);
  for (let i = 0; i < 14; i++) {
    const x = qx(), y = qy(), len = 2 + irand(5), horiz = rng() < 0.5;
    for (let k = 0; k < len; k++) {
      const cx = x + (horiz ? k : 0), cy = y + (horiz ? 0 : k);
      if (cx < COLS / 2 && cy < ROWS / 2) mirror(cx, cy, WALL);
    }
  }
  for (let i = 0; i < 26; i++) mirror(qx(), qy(), CRATE);
  for (let i = 0; i < 9; i++) mirror(qx(), qy(), BARREL);

  // ---------- robots ----------
  function addBot(r, team, x, y) {
    const ch = CHASSIS[r.chassis] ? r.chassis : 'brawler';
    const c = CHASSIS[ch];
    const weapon = WEAPONS[r.weapon] ? r.weapon : 'blaster';
    const maxHp = Math.round(rand(200, 320) * c.hp * (WEAPONS[weapon].melee ? 1.25 : 1));
    const b = {
      id: s.bots.length, name: r.name, team: team.id, teamColor: team.color,
      color: r.color || team.color, chassis: ch, weapon,
      x: Math.max(TILE + 16, Math.min(W - TILE - 16, x)),
      y: Math.max(TILE + 16, Math.min(H - TILE - 16, y)),
      kx: 0, ky: 0, angle: Math.atan2(H / 2 - y, W / 2 - x), heading: 0,
      baseR: c.r, hp: maxHp, maxHp,
      speed: rand(70, 115) * c.speed * (WEAPONS[weapon].melee ? 1.2 : 1),
      dmg: rand(0.8, 1.3) * c.dmg,
      rate: rand(0.8, 1.3),
      armor: rand(0, 0.25) + c.armor,
      crit: rand(0.03, 0.2),
      cool: rand(0.2, 1), alive: true, target: -1, retarget: 0,
      strafe: rng() < 0.5 ? -1 : 1, strafeT: rand(0.5, 2), stuck: 0, wander: 0, wanderT: 0,
      fx: { shield: 0, overdrive: 0, haste: 0, giant: 0 },
      kills: 0, dealt: 0, diedAt: null,
    };
    b.heading = b.angle;
    s.bots.push(b);
    const cx = (b.x / TILE) | 0, cy = (b.y / TILE) | 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (inside(cx + dx, cy + dy)) setTile(cx + dx, cy + dy, EMPTY);
  }

  const spin = rng() * TAU;
  teams.forEach((team, ti) => {
    const members = config.robots.filter((r) => r.team === team.id);
    const a = spin + (ti / teams.length) * TAU;
    const cx = W / 2 + Math.cos(a) * W * 0.36, cy = H / 2 + Math.sin(a) * H * 0.33;
    const md = members.length > 1 ? 22 + members.length * 5 : 0;
    members.forEach((r, mi) => {
      const ma = a + (mi / members.length) * TAU;
      addBot(r, team, cx + Math.cos(ma) * md, cy + Math.sin(ma) * md);
    });
  });

  // ---------- damage ----------
  function destroyTile(cx, cy, src) {
    const type = tiles[idx(cx, cy)];
    if (type === EMPTY || type === STEEL) return;
    setTile(cx, cy, EMPTY);
    const x = (cx + 0.5) * TILE, y = (cy + 0.5) * TILE;
    ev({ type: 'tilebreak', x, y, tile: type });
    if (type === BARREL) s.pending.push({ x, y, r: 62, dmg: 28, t: 0.07, owner: src });
    if (type === CRATE && rng() < 0.3) spawnPowerup(x, y, 0);
  }

  function damageTile(cx, cy, dmg, src) {
    const type = tileAt(cx, cy);
    if (type === EMPTY || type === STEEL) return;
    const i = idx(cx, cy);
    tileHp[i] -= dmg;
    if (tileHp[i] <= 0) destroyTile(cx, cy, src);
    else ev({ type: 'tilehit', x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE, tile: type });
  }

  function kill(b, src) {
    b.alive = false;
    b.hp = 0;
    b.diedAt = s.t;
    lastDead = b;
    const killer = src >= 0 && src !== b.id ? s.bots[src] : null;
    if (killer) killer.kills++;
    ev({ type: 'death', id: b.id, killer: killer ? killer.id : -1, x: b.x, y: b.y });
    s.pending.push({ x: b.x, y: b.y, r: 44, dmg: 14, t: 0.05, owner: -1 });
  }

  function hurt(b, amt, src, crit = false) {
    if (!b.alive) return;
    if (b.fx.shield > 0) {
      ev({ type: 'block', x: b.x, y: b.y });
      return;
    }
    amt *= 1 - b.armor;
    b.hp -= amt;
    if (src >= 0 && src !== b.id) s.bots[src].dealt += amt;
    ev({ type: 'hit', x: b.x, y: b.y, amt, crit });
    if (b.hp <= 0) kill(b, src);
  }

  // Explosions hit everyone, friends included. That's the point.
  function explode(x, y, R, dmg, owner, immune = -1) {
    ev({ type: 'boom', x, y, r: R });
    for (const e of s.bots) {
      if (!e.alive || e.id === immune) continue;
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
      if (d > R + rad(e)) continue;
      const f = 1 - 0.6 * Math.min(1, d / R);
      hurt(e, dmg * f * (e.id === owner ? 0.5 : 1), owner);
      const k = (300 * f) / (d || 1);
      e.kx += dx * k;
      e.ky += dy * k;
    }
    const x0 = Math.floor((x - R) / TILE), x1 = Math.floor((x + R) / TILE);
    const y0 = Math.floor((y - R) / TILE), y1 = Math.floor((y + R) / TILE);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const d = Math.hypot((cx + 0.5) * TILE - x, (cy + 0.5) * TILE - y);
        if (d < R) damageTile(cx, cy, dmg * 1.6 * (1 - (0.5 * d) / R), owner);
      }
  }

  // ---------- movement ----------
  function blocked(x, y, h, crush) {
    let hit = false;
    for (const [ox, oy] of [[-h, -h], [h, -h], [-h, h], [h, h]]) {
      const cx = Math.floor((x + ox) / TILE), cy = Math.floor((y + oy) / TILE);
      const type = tileAt(cx, cy);
      if (type === EMPTY) continue;
      if (crush && type !== STEEL) destroyTile(cx, cy, -1);
      else hit = true;
    }
    return hit;
  }

  function moveBot(b, dx, dy) {
    const r = rad(b), h = r * 0.75, crush = b.fx.giant > 0;
    const ox = b.x, oy = b.y;
    if (!blocked(b.x + dx, b.y, h, crush)) b.x += dx;
    if (!blocked(b.x, b.y + dy, h, crush)) b.y += dy;
    b.x = Math.max(TILE + h, Math.min(W - TILE - h, b.x));
    b.y = Math.max(TILE + h, Math.min(H - TILE - h, b.y));
    return Math.hypot(b.x - ox, b.y - oy);
  }

  // First solid tile along a ray, or null.
  function raycast(x, y, angle, maxDist) {
    const sx = Math.cos(angle) * 6, sy = Math.sin(angle) * 6;
    for (let d = 0; d < maxDist; d += 6) {
      x += sx;
      y += sy;
      const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
      if (tileAt(cx, cy) !== EMPTY) return { cx, cy };
    }
    return null;
  }

  // ---------- weapons ----------
  function fireRail(b, dmg, crit) {
    const r = rad(b), ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    const x0 = b.x + ca * r, y0 = b.y + sa * r;
    let x = x0, y = y0, pierced = 0;
    const struck = new Set();
    for (let d = 0; d < WEAPONS.rail.range; d += 4) {
      x += ca * 4;
      y += sa * 4;
      const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
      const type = tileAt(cx, cy);
      if (type === STEEL) break;
      if (type !== EMPTY) {
        damageTile(cx, cy, 45, b.id);
        if (tileAt(cx, cy) !== EMPTY || ++pierced >= 3) break;
      }
      for (const e of s.bots) {
        if (!e.alive || e.team === b.team || struck.has(e.id)) continue;
        if (Math.hypot(e.x - x, e.y - y) < rad(e) + 2) {
          struck.add(e.id);
          hurt(e, dmg, b.id, crit);
        }
      }
    }
    ev({ type: 'beam', x1: x0, y1: y0, x2: x, y2: y, color: b.color });
  }

  function fire(b, w) {
    const giant = b.fx.giant > 0 ? 1.5 : 1;
    const crit = rng() < b.crit;
    const dmg = w.dmg * b.dmg * giant * (crit ? 2 : 1);
    b.cool = w.cd / (b.rate * (b.fx.overdrive > 0 ? 2.2 : 1));
    const r = rad(b);
    ev({ type: 'fire', kind: b.weapon, x: b.x + Math.cos(b.angle) * (r + 4), y: b.y + Math.sin(b.angle) * (r + 4) });
    if (w.hitscan) return fireRail(b, dmg, crit);
    for (let i = 0; i < (w.pellets || 1); i++) {
      const a = b.angle + (rng() - 0.5) * 2 * w.spread;
      s.shots.push({
        x: b.x + Math.cos(a) * (r + 4), y: b.y + Math.sin(a) * (r + 4),
        vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        team: b.team, owner: b.id, dmg, crit, kind: b.weapon, blast: w.blast || 0,
        life: (w.range * 1.15) / w.speed,
      });
    }
  }

  // ---------- AI ----------
  function pickTarget(b) {
    let best = null, bestScore = Infinity;
    for (const e of s.bots) {
      if (!e.alive || e.team === b.team) continue;
      const score = Math.hypot(e.x - b.x, e.y - b.y) * (0.8 + rng() * 0.4);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  function nearestPowerup(b, maxDist) {
    let best = null, bestD = maxDist;
    for (const p of s.powerups) {
      if (p.fall > 0) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best && { p: best, d: bestD || 1 };
  }

  function think(b) {
    const fx = b.fx;
    for (const k in fx) if (fx[k] > 0) fx[k] -= DT;
    b.cool -= DT;
    const r = rad(b);
    // Anything a robot ends up inside of (teleport, growth, falling junk) gets crushed.
    blocked(b.x, b.y, r * 0.75, true);

    b.retarget -= DT;
    let tgt = b.target >= 0 ? s.bots[b.target] : null;
    if (!tgt || !tgt.alive || b.retarget <= 0) {
      tgt = pickTarget(b);
      b.target = tgt ? tgt.id : -1;
      b.retarget = rand(0.4, 1.1);
    }
    if (!tgt) return;

    const w = WEAPONS[b.weapon];
    const dx = tgt.x - b.x, dy = tgt.y - b.y, d = Math.hypot(dx, dy) || 1;
    const hurting = b.hp < b.maxHp * 0.5;
    const pu = nearestPowerup(b, hurting ? 320 : 170);

    let mx = 0, my = 0;
    if (b.wanderT > 0) {
      b.wanderT -= DT;
      mx = Math.cos(b.wander);
      my = Math.sin(b.wander);
    } else if (pu && (pu.d < d || hurting)) {
      mx = (pu.p.x - b.x) / pu.d;
      my = (pu.p.y - b.y) / pu.d;
    } else {
      const pref = w.melee ? 0 : w.range * 0.6;
      const dir = d > pref ? 1 : d < pref * 0.5 ? -1 : 0;
      mx = (dx / d) * dir;
      my = (dy / d) * dir;
      if (!w.melee) {
        b.strafeT -= DT;
        if (b.strafeT <= 0) {
          b.strafe = rng() < 0.5 ? -1 : 1;
          b.strafeT = rand(0.5, 2);
        }
        mx += (-dy / d) * b.strafe * 0.7;
        my += (dx / d) * b.strafe * 0.7;
      }
    }
    if (s.sudden && layerOf((b.x / TILE) | 0, (b.y / TILE) | 0) <= s.lava) {
      const lx = W / 2 - b.x, ly = H / 2 - b.y, ll = Math.hypot(lx, ly) || 1;
      mx += (lx / ll) * 2;
      my += (ly / ll) * 2;
    }

    const ml = Math.hypot(mx, my);
    if (ml > 0.01) {
      const step = b.speed * (fx.haste > 0 ? 1.7 : 1) * DT;
      const moved = moveBot(b, (mx / ml) * step, (my / ml) * step);
      b.heading = Math.atan2(my, mx);
      b.stuck = moved < step * 0.3 ? b.stuck + DT : Math.max(0, b.stuck - DT);
      if (b.stuck > 0.45) {
        b.stuck = 0;
        b.wander = rng() * TAU;
        b.wanderT = rand(0.3, 0.6);
        b.strafe = -b.strafe;
      }
    }
    if (Math.abs(b.kx) + Math.abs(b.ky) > 1) {
      moveBot(b, b.kx * DT, b.ky * DT);
      b.kx *= 0.88;
      b.ky *= 0.88;
    }

    const want = Math.atan2(dy, dx);
    const turn = angDiff(b.angle, want), maxTurn = 7 * DT;
    b.angle += Math.max(-maxTurn, Math.min(maxTurn, turn));

    if (b.cool > 0) return;
    if (w.melee) {
      b.cool = w.cd / (b.rate * (fx.overdrive > 0 ? 2.2 : 1));
      const dmg = w.dmg * b.dmg * (fx.giant > 0 ? 1.5 : 1);
      for (const e of s.bots)
        if (e.alive && e.team !== b.team && Math.hypot(e.x - b.x, e.y - b.y) < r + rad(e) + 7) hurt(e, dmg, b.id);
      const hx = b.x + Math.cos(b.heading) * (r + 8), hy = b.y + Math.sin(b.heading) * (r + 8);
      damageTile(Math.floor(hx / TILE), Math.floor(hy / TILE), 12, b.id);
    } else if (Math.abs(turn) < 0.3) {
      // Walls in the way are not an obstacle, they're a target.
      if (d < w.range + rad(tgt) || raycast(b.x, b.y, b.angle, Math.min(d, 80))) fire(b, w);
    }
  }

  function separate() {
    const bots = s.bots;
    for (let i = 0; i < bots.length; i++) {
      const a = bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < bots.length; j++) {
        const c = bots[j];
        if (!c.alive) continue;
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        const overlap = rad(a) + rad(c) - d;
        if (overlap <= 0) continue;
        const px = (dx / d) * overlap * 0.5, py = (dy / d) * overlap * 0.5;
        moveBot(a, -px, -py);
        moveBot(c, px, py);
      }
    }
  }

  // ---------- projectiles, power-ups, hazards ----------
  function stepShots() {
    for (let i = s.shots.length - 1; i >= 0; i--) {
      const p = s.shots[i];
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.life -= DT;
      let done = p.life <= 0;
      const cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
      if (tileAt(cx, cy) !== EMPTY) {
        if (!p.blast) damageTile(cx, cy, p.dmg, p.owner);
        done = true;
      } else {
        for (const e of s.bots) {
          if (!e.alive || e.team === p.team) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) < rad(e) + 3) {
            if (!p.blast) hurt(e, p.dmg, p.owner, p.crit);
            done = true;
            break;
          }
        }
      }
      if (!done) continue;
      if (p.blast) explode(p.x, p.y, p.blast, p.dmg, p.owner);
      s.shots.splice(i, 1);
    }
  }

  function spawnPowerup(x, y, fall, type = POWERUP_KEYS[irand(POWERUP_KEYS.length)]) {
    s.powerups.push({ x, y, type, fall, life: 14 });
  }

  // A random open-ground spot that the lava hasn't reached yet.
  function safeCell() {
    for (let tries = 0; tries < 12; tries++) {
      const cx = 1 + irand(COLS - 2), cy = 1 + irand(ROWS - 2);
      if (layerOf(cx, cy) > s.lava) return { cx, cy, x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE };
    }
    return null;
  }

  function dropPowerup() {
    const c = safeCell();
    if (c) spawnPowerup(c.x, c.y, 1);
  }

  function applyPowerup(b, type) {
    ev({ type: 'pickup', id: b.id, power: type, x: b.x, y: b.y });
    switch (type) {
      case 'repair': b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.45); break;
      case 'overdrive': b.fx.overdrive = 6; break;
      case 'shield': b.fx.shield = 5; break;
      case 'haste': b.fx.haste = 6; break;
      case 'giant':
        b.fx.giant = 7;
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.15);
        break;
      case 'nuke': explode(b.x, b.y, 150, 55, b.id, b.id); break;
      case 'shuffle': {
        const alive = s.bots.filter((e) => e.alive);
        const spots = alive.map((e) => ({ x: e.x, y: e.y }));
        for (let i = spots.length - 1; i > 0; i--) {
          const j = irand(i + 1);
          [spots[i], spots[j]] = [spots[j], spots[i]];
        }
        alive.forEach((e, i) => {
          e.x = spots[i].x;
          e.y = spots[i].y;
          e.target = -1;
        });
        ev({ type: 'shuffle', pts: spots });
        break;
      }
      case 'airstrike': {
        let n = 0;
        for (const e of s.bots) {
          if (!e.alive || e.team === b.team || n++ >= 8) continue;
          s.meteors.push({ x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), t: rand(0.9, 1.5), T: 1.5, r: 50, dmg: 30, owner: b.id });
        }
        break;
      }
    }
  }

  function stepPowerups() {
    for (let i = s.powerups.length - 1; i >= 0; i--) {
      const p = s.powerups[i];
      if (p.fall > 0) {
        p.fall -= DT;
        if (p.fall <= 0) {
          destroyTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE), -1);
          ev({ type: 'land', x: p.x, y: p.y });
        }
        continue;
      }
      p.life -= DT;
      const taker = s.bots.find((b) => b.alive && Math.hypot(b.x - p.x, b.y - p.y) < rad(b) + 11);
      if (taker || p.life <= 0) s.powerups.splice(i, 1);
      if (taker) applyPowerup(taker, p.type);
    }
  }

  function stepMeteors() {
    for (let i = s.meteors.length - 1; i >= 0; i--) {
      const m = s.meteors[i];
      m.t -= DT;
      if (m.t > 0) continue;
      s.meteors.splice(i, 1);
      explode(m.x, m.y, m.r, m.dmg, m.owner);
    }
  }

  function stepPending() {
    for (let i = s.pending.length - 1; i >= 0; i--) {
      const p = s.pending[i];
      p.t -= DT;
      if (p.t > 0) continue;
      s.pending.splice(i, 1);
      explode(p.x, p.y, p.r, p.dmg, p.owner);
    }
  }

  const CHAOS = {
    meteors() {
      ev({ type: 'banner', text: 'METEOR SHOWER' });
      for (let n = 6 + irand(6); n > 0; n--) {
        const T = rand(0.8, 2.4);
        s.meteors.push({ x: rand(TILE * 2, W - TILE * 2), y: rand(TILE * 2, H - TILE * 2), t: T, T, r: 50, dmg: 30, owner: -1 });
      }
    },
    quake() {
      ev({ type: 'banner', text: 'EARTHQUAKE' });
      ev({ type: 'quake' });
      for (let cy = 1; cy < ROWS - 1; cy++)
        for (let cx = 1; cx < COLS - 1; cx++) if (tiles[idx(cx, cy)] !== EMPTY && rng() < 0.3) damageTile(cx, cy, 30, -1);
    },
    supply() {
      ev({ type: 'banner', text: 'SUPPLY DROP' });
      for (let n = 0; n < 5; n++) dropPowerup();
    },
    barrels() {
      ev({ type: 'banner', text: 'BARREL RAIN' });
      for (let n = 0; n < 10; n++) {
        const c = safeCell();
        if (!c || tiles[idx(c.cx, c.cy)] !== EMPTY) continue;
        if (s.bots.some((b) => b.alive && Math.hypot(b.x - c.x, b.y - c.y) < 34)) continue;
        setTile(c.cx, c.cy, BARREL);
        ev({ type: 'land', x: c.x, y: c.y });
      }
    },
    overcharge() {
      ev({ type: 'banner', text: 'OVERCHARGE' });
      for (const b of s.bots) if (b.alive) b.fx.overdrive = 4;
    },
  };
  const CHAOS_KEYS = Object.keys(CHAOS);

  function director() {
    if (s.t >= nextDrop) {
      dropPowerup();
      nextDrop = s.t + Math.max(0.9, 2.4 - s.t * 0.025) * rand(0.7, 1.3);
    }
    if (s.t >= nextEvent) {
      CHAOS[CHAOS_KEYS[irand(CHAOS_KEYS.length)]]();
      nextEvent = s.t + (s.sudden ? rand(3, 5) : rand(6, 10));
    }
  }

  // Sudden death: lava closes in from the walls so every battle ends.
  function stepLava() {
    if (!s.sudden && s.t >= SUDDEN_AT) {
      s.sudden = true;
      s.lava = 1;
      nextLava = s.t + 2.5;
      ev({ type: 'banner', text: 'SUDDEN DEATH' });
    }
    if (!s.sudden) return;
    if (s.t >= nextLava && s.lava < MAX_LAVA) {
      const layer = s.lava++;
      nextLava = s.t + 2.2;
      for (let cy = 1; cy < ROWS - 1; cy++)
        for (let cx = 1; cx < COLS - 1; cx++) if (layerOf(cx, cy) === layer) setTile(cx, cy, EMPTY);
      ev({ type: 'lava', layer });
    }
    const dps = 18 + (s.t - SUDDEN_AT) * 1.2;
    for (const b of s.bots) {
      if (!b.alive || layerOf((b.x / TILE) | 0, (b.y / TILE) | 0) >= s.lava) continue;
      b.hp -= dps * DT;
      if (b.hp <= 0) kill(b, -1);
    }
  }

  function checkOver() {
    const alive = new Set();
    for (const b of s.bots) if (b.alive) alive.add(b.team);
    if (alive.size > 1) return;
    s.over = true;
    // If the last robots go down together, the one that died last takes it.
    s.winner = alive.size === 1 ? [...alive][0] : lastDead.team;
    ev({ type: 'over', team: s.winner });
  }

  function step() {
    if (s.over) return;
    s.t += DT;
    director();
    for (const b of s.bots) if (b.alive) think(b);
    separate();
    stepShots();
    stepPowerups();
    stepMeteors();
    stepPending();
    stepLava();
    checkOver();
  }

  function result() {
    if (!s.over) return null;
    return {
      winner: teams.find((t) => t.id === s.winner),
      duration: s.t,
      survivors: s.bots.filter((b) => b.alive),
      // Survivors first, then by how long they lasted.
      standings: [...s.bots].sort((a, b) => (b.diedAt ?? Infinity) - (a.diedAt ?? Infinity) || b.kills - a.kills),
    };
  }

  if (teams.length < 2) checkOver();
  return { state: s, step, result, teams };
}

// Run a whole battle with no rendering, e.g. to decide the winner on a server.
export function simulate(config) {
  const battle = createBattle(config);
  while (!battle.state.over) {
    battle.step();
    battle.state.events.length = 0;
  }
  return battle.result();
}
