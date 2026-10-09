// Run with: node game/test/lobby-battle.test.mjs
import assert from 'node:assert';
import { simulate, CHASSIS, WEAPONS } from '../src/sim.js';
import { EYES, HATS, PATTERNS } from '../src/render.js';
import { buildConfig, winnerId } from '../src/fighters.js';

const COLORS = ['#ff4f7b', '#ffd23f', '#3ee6a8', '#4fb0ff'];
const players = (n, pick = (i) => `Thing ${i}`) => Array.from({ length: n }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: `Player ${i}`, pick: pick(i), color: COLORS[i % COLORS.length], connected: true,
}));
const room = (mode, ps) => ({ code: 'ABCD', mode, status: 'battle', players: ps });

// deterministic per player id, independent of the seed and of who else is in the room
const a = buildConfig(room('ffa', players(5)), 'x').config, b = buildConfig(room('ffa', players(8)), 'y').config;
for (let i = 0; i < 5; i++) assert.deepStrictEqual(a.robots[i], { ...b.robots[i], team: a.robots[i].team });
assert.deepStrictEqual(buildConfig(room('ffa', players(5)), 'x'), buildConfig(room('ffa', players(5)), 'x'));

// ffa: one team per player, pid carried, team named after the pick
const ffa = buildConfig(room('ffa', players(4)), 's');
assert.strictEqual(ffa.mode, 'ffa');
assert.strictEqual(ffa.config.teams.length, 4);
assert.strictEqual(new Set(ffa.config.robots.map((r) => r.team)).size, 4);
ffa.config.robots.forEach((r, i) => assert.strictEqual(r.pid, players(4)[i].id));
assert.strictEqual(ffa.config.teams[2].name, 'Thing 2');
assert.strictEqual(ffa.config.robots[2].cry, 'For Thing 2!');
assert.strictEqual(ffa.config.suddenAt, undefined);

// teams: grouped by case-insensitive pick, falls back to ffa with one team
const t = buildConfig(room('teams', players(6, (i) => (i < 3 ? (i % 2 ? 'pizza' : 'PIZZA') : 'Tacos'))), 's');
assert.strictEqual(t.mode, 'teams');
assert.strictEqual(t.config.teams.length, 2);
const one = buildConfig(room('teams', players(4, () => 'Pizza')), 's');
assert.strictEqual(one.mode, 'ffa');
assert.strictEqual(one.config.teams.length, 4);

// bad input
assert.ok(buildConfig(room('ffa', players(1)), 's').error);
assert.ok(buildConfig(null, 's').error);
const odd = buildConfig(room('ffa', [{ id: 'a', name: '<b>x</b>', pick: 'p', color: 'red' }, { id: 'b', name: '', pick: '', color: null }]), 's').config;
assert.match(odd.robots[0].color, /^#[0-9a-f]{6}$/i);
assert.strictEqual(odd.robots[1].name, 'Unnamed');

// custom robots: the player's own build is used as sent, owner is the player
const mine = { name: 'Zap Cannon', owner: 'someone else', cry: 'Boom!', color: '#123456', accent: '#abcdef', chassis: 'tank', weapon: 'rail', eyes: 'visor', hat: 'crown', pattern: 'spots' };
const withBot = (n, robot) => players(n).map((p) => ({ ...p, robot }));
const c1 = buildConfig(room('ffa', withBot(2, mine)), 's').config.robots[0];
assert.deepStrictEqual({ ...c1, pid: 0, team: 0, owner: '' }, { ...mine, pid: 0, team: 0, owner: '' });
assert.strictEqual(c1.owner, 'Player 0');
assert.strictEqual(c1.pid, players(2)[0].id);

// junk robot fields are sanitized to valid values
const junk = { name: 'N'.repeat(99), cry: '<script>alert(1)</script>', color: 'red', accent: 5, chassis: '__proto__', weapon: 'nope', eyes: 7, hat: null, pattern: {} };
const j = buildConfig(room('ffa', withBot(2, junk)), 's').config.robots[0];
assert.match(j.color, /^#[0-9a-f]{6}$/i);
assert.match(j.accent, /^#[0-9a-f]{6}$/i);
assert.ok(j.name.length <= 18 && j.cry.length <= 32);
for (const [k, m] of [['chassis', CHASSIS], ['weapon', WEAPONS], ['eyes', EYES], ['hat', HATS], ['pattern', PATTERNS]]) assert.ok(Object.hasOwn(m, j[k]), `${k} valid`);

// blank robot name falls back to the player name
assert.strictEqual(buildConfig(room('ffa', withBot(2, { ...mine, name: '   ' })), 's').config.robots[1].name, 'Player 1');

// 60 custom-robot players still finish a battle
const big = players(60).map((p, i) => ({ ...p, robot: { ...mine, name: `Bot ${i}`, chassis: Object.keys(CHASSIS)[i % 3], weapon: Object.keys(WEAPONS)[i % 4] } }));
const bigCfg = buildConfig(room('ffa', big), 'c1').config;
const bigRes = simulate(bigCfg);
assert.ok(big.find((p) => p.id === winnerId(bigRes)), 'custom 60: winner maps to a player');
assert.ok(bigRes.duration < 150, 'custom 60 ends in time');

// full battles, ffa and teams, up to the server's 60 players: winner maps back to a player
for (const [mode, n] of [['ffa', 2], ['ffa', 13], ['ffa', 60], ['teams', 60]]) {
  for (const seed of ['a1', 'b2']) {
    const ps = players(n, (i) => `Side ${i % 5}`);
    const { config } = buildConfig(room(mode, ps), seed);
    const r = simulate(config);
    const id = winnerId(r);
    const w = ps.find((p) => p.id === id);
    assert.ok(w, `${mode} ${n}: winner id maps to a player`);
    if (mode === 'ffa') assert.strictEqual(config.robots.find((x) => x.pid === id).team, r.winner.id);
    else assert.strictEqual(w.pick, r.winner.name);
    assert.strictEqual(winnerId(simulate(config)), id, 'same seed, same winner');
    assert.ok(r.duration < 150, `${mode} ${n} ends in time (${r.duration.toFixed(1)}s)`);
    if (n === 60) console.log(`${mode} 60 players, seed ${seed}: ${r.duration.toFixed(1)}s`);
  }
}
console.log('lobby-battle ok');
