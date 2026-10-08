// Run with: node game/test/sim.test.mjs
import assert from 'node:assert';
import { simulate, CHASSIS, WEAPONS } from '../src/sim.js';

const chassis = Object.keys(CHASSIS), weapons = Object.keys(WEAPONS);

function config(seed, teamCount, perTeam) {
  const teams = [], robots = [];
  for (let t = 0; t < teamCount; t++) {
    teams.push({ id: t, name: `Option ${t}`, color: '#fff' });
    for (let i = 0; i < perTeam; i++) {
      const n = t * perTeam + i;
      robots.push({ name: `Bot ${n}`, team: t, chassis: chassis[n % chassis.length], weapon: weapons[(n + seed) % weapons.length] });
    }
  }
  return { seed, teams, robots };
}

const summary = (r) => JSON.stringify([r.winner.id, r.duration, r.standings.map((b) => [b.id, b.diedAt, b.kills])]);

let longest = 0, total = 0, runs = 0;
const wins = {};
for (const [teams, perTeam] of [[2, 1], [2, 4], [3, 2], [6, 1], [6, 4]]) {
  for (let seed = 1; seed <= 40; seed++) {
    const r = simulate(config(seed, teams, perTeam));
    assert.ok(r.winner, 'every battle has a winner');
    assert.ok(r.duration < 120, `battle ends in reasonable time (took ${r.duration})`);
    longest = Math.max(longest, r.duration);
    total += r.duration;
    runs++;
    wins[r.winner.id] = (wins[r.winner.id] || 0) + 1;
  }
}

assert.strictEqual(summary(simulate(config(7, 3, 3))), summary(simulate(config(7, 3, 3))), 'same seed, same battle');
assert.notStrictEqual(summary(simulate(config(7, 3, 3))), summary(simulate(config(8, 3, 3))), 'different seed, different battle');

console.log(`ok: ${runs} battles, avg ${(total / runs).toFixed(1)}s, longest ${longest.toFixed(1)}s, wins by team id`, wins);
