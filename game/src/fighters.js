// Lobby players -> battle config. No DOM, so it runs in Node tests. A player's robot is derived from their id,
// so the same player gets the same robot every round and refresh.
import { CHASSIS, WEAPONS } from './sim.js';
import { EYES, HATS, PATTERNS } from './render.js';
import { PALETTE, LIM, HEX, text } from './robot.js';
import { hashSeed, makeRng } from './rng.js';

export const CROWD = 12, CROWD_SUDDEN = 25;

function robotFor(p, i) {
  const rng = makeRng(hashSeed(String(p.id)));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const color = HEX.test(p.color) ? p.color : PALETTE[i % PALETTE.length];
  const name = text(p.name, LIM.name).trim() || 'Unnamed';
  return {
    pid: p.id, name, owner: '', cry: text(`For ${text(p.pick, LIM.opt)}!`, LIM.cry), color,
    accent: pick([...PALETTE.filter((c) => c !== color), '#ffffff', '#0b0d12']),
    chassis: pick(Object.keys(CHASSIS)), weapon: pick(Object.keys(WEAPONS)),
    eyes: pick(Object.keys(EYES)), hat: pick(Object.keys(HATS)), pattern: pick(Object.keys(PATTERNS)),
  };
}

// room: the /api/rooms/CODE payload. Returns { config, mode } (mode is what was actually used) or { error }.
export function buildConfig(room, seed) {
  const players = Array.isArray(room?.players) ? room.players.filter((p) => p && typeof p.id === 'string') : [];
  if (players.length < 2) return { error: 'Need at least 2 fighters to start a battle.' };
  const bots = players.map(robotFor);
  const label = (p) => text(p.pick, LIM.opt).trim() || 'Anything';
  let teams = [], robots = [], mode = 'ffa';
  if (room.mode === 'teams') {
    const ids = new Map();
    players.forEach((p, i) => {
      const key = label(p).toLowerCase();
      if (!ids.has(key)) {
        ids.set(key, teams.length);
        teams.push({ id: teams.length, name: label(p), color: bots[i].color });
      }
      robots.push({ ...bots[i], team: ids.get(key) });
    });
    mode = 'teams';
  }
  if (mode === 'ffa' || teams.length < 2) {
    mode = 'ffa';
    teams = players.map((p, i) => ({ id: i, name: label(p), color: bots[i].color }));
    robots = bots.map((b, i) => ({ ...b, team: i }));
  }
  const config = { seed, teams, robots };
  if (robots.length > CROWD) config.suddenAt = CROWD_SUDDEN;
  return { config, mode };
}

// Player id to report: the winning team's top-standing robot (in ffa, the team's only robot).
export function winnerId(result) {
  return result.standings.find((b) => b.team === result.winner.id)?.pid ?? null;
}
