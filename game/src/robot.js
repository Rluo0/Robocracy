// Robot data shared by the host shell and the phone page. No DOM, no side effects.
import { CHASSIS, WEAPONS } from './sim.js';
import { EYES, HATS, PATTERNS } from './render.js';

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
export const CORES = ['Clanker', 'Sprocket', 'Rustbucket', 'Gizmo', 'Clanks', 'Toasty', 'Widget', 'Zapp', 'Crankshaft', 'Dent', 'Tin Fury',
  'Scrapheap', 'Voltina', 'Gearhead', 'Bolt Face', 'Wrecksy', 'Fuse', 'Piston Pete', 'Lugnut', 'Sparky', 'Nutbolt', 'Gadget', 'Rivet', 'Doomba'];
export const TITLES = ['Sir', 'Dr.', 'Lady', 'Lord', 'Count', 'Chef', 'Big', 'Mini', 'Captain', 'Madame'];
export const SUFFIXES = ['the Dented', 'the Rusty', 'Jr.', 'the Third', 'McBolt', 'the Squeaky', 'Deluxe', 'of Doom', 'XL'];
export const CRIES = ['Prepare to be recycled!', 'I run on pure spite!', 'Beep boop, you lose!', 'Tremble, toasters!', 'Oil be back!',
  'Nuts and bolts and victory!', 'Resistance is squeaky!', 'Scrap metal incoming!', 'Who wants a hug? Kidding.', 'Bow before the bolt!',
  'My circuits say you lose!', 'Shiny side up!', 'Fear the clank!', 'This is my arena!', 'Rust in peace!',
  'Sparks will fly!', 'Zero chill, full charge!', 'Battery low on mercy!', 'Pick me, I am right!', 'Hold my screwdriver!'];
export const LIM = { name: 18, owner: 16, cry: 32, opt: 24, question: 80 };
export const HEX = { test: (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) };
export const BLURBS = {
  tank: 'Tough and slow', scout: 'Fast and fragile', brawler: 'Hits harder',
  blaster: 'Rapid fire', scatter: 'Close-range spray', rocket: 'Slow, explosive', rail: 'Long-range pierce', saw: 'Melee, extra tough',
};

export const text = (v, max) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').slice(0, max);
export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const keyOr = (map, k, d) => (typeof k === 'string' && Object.hasOwn(map, k) ? k : d);

export function randomName() {
  for (let i = 0; i < 8; i++) {
    const core = pick(CORES), roll = Math.random();
    const n = roll < 0.35 ? `${pick(TITLES)} ${core}` : roll < 0.6 ? `${core} ${pick(SUFFIXES)}` : core;
    if (n.length <= LIM.name) return n;
  }
  return pick(CORES);
}

export const randomRobot = (color) => ({
  name: randomName(), owner: '', cry: pick(CRIES), color,
  accent: pick([...PALETTE.filter((c) => c !== color), '#ffffff', '#0b0d12']),
  chassis: pick(Object.keys(CHASSIS)), weapon: pick(Object.keys(WEAPONS)),
  eyes: pick(Object.keys(EYES)), hat: pick(Object.keys(HATS)), pattern: pick(Object.keys(PATTERNS)),
});
// Same robot, new look: keeps who built it and its paint.
export const reroll = (r) => ({ ...randomRobot(r.color), owner: r.owner });

// Clean robot from untrusted input (storage or network), or null.
export function sanitizeRobot(r, fallbackColor = PALETTE[0]) {
  if (!r || typeof r !== 'object') return null;
  const paint = HEX.test(r.color) ? r.color : fallbackColor;
  return {
    name: text(r.name, LIM.name), owner: text(r.owner, LIM.owner), cry: text(r.cry, LIM.cry), color: paint,
    accent: HEX.test(r.accent) ? r.accent : PALETTE.find((c) => c !== paint),
    chassis: keyOr(CHASSIS, r.chassis, 'brawler'), weapon: keyOr(WEAPONS, r.weapon, 'blaster'),
    eyes: keyOr(EYES, r.eyes, Object.keys(EYES)[0]), hat: keyOr(HATS, r.hat, Object.keys(HATS)[0]), pattern: keyOr(PATTERNS, r.pattern, Object.keys(PATTERNS)[0]),
  };
}
