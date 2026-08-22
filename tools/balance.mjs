// Balance report for the skill tree. Pure maths — no browser, no rendering.
// Run: node tools/balance.mjs
//
// The thing worth measuring is a real fight, not an infinite one. Fights in
// this game last seconds, so a 40s cooldown is not "22% uptime", it is "once,
// at the start, and it lasts the whole fight". This simulates the actual loop
// from main.js — stamina, cooldowns, swing animations, buffs — tick by tick.
import {
  NODES, NODE_BY_ID, MAX_LEVEL, pointsForLevel, skillPower, passiveTotals, spentPoints,
} from '../src/skilltree.js';
import { ABILITY_BY_ID } from '../src/abilities.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DT = 0.02;
const SWING = 0.52;            // playerAttack: base swing duration
const SWING_HIT = 0.34;        // fraction of the swing where the blade lands
const SWING_COST = 12;
const STAM_REGEN = 14;         // per second, standing still

/* --------------------------- the character --------------------------- */
// gear: the merchant and drops both scale as items.js does
// rarity multipliers from items.js; 1.0 is a plain drop, 2.1 a legendary
const weaponSkade = (lvl, mult = 1) => Math.round((5 + lvl * 1.6) * mult);
const baseDamage = (lvl, mult = 1) => 6 + weaponSkade(lvl, mult) + (lvl - 1) * 3;
const baseHp = lvl => 100 + 7 + (lvl - 1) * 12;
// monsters.js pulls in three.js for its models, so it cannot be imported here.
// Read its numbers out of the source instead, so this report cannot drift from it.
const monsterSrc = readFileSync(fileURLToPath(new URL('../src/monsters.js', import.meta.url)), 'utf8');
const kindNum = (kind, key) => {
  const block = monsterSrc.split(`  ${kind}: {`)[1];
  return Number(block.match(new RegExp(`\\b${key}: ([0-9.]+)`))[1]);
};
const [, hpBase, hpPer] = monsterSrc.match(/hp = Math\.round\(\((\d+) \+ \(level - 1\) \* ([0-9.]+)\)/).map(Number);
const [, dmgBase, dmgPer] = monsterSrc.match(/damage: \((\d+) \+ \(level - 1\) \* ([0-9.]+)\)/).map(Number);
const rawHp = lvl => hpBase + (lvl - 1) * hpPer;
const monsterHp = lvl => Math.round(rawHp(lvl) * kindNum('brute', 'hp'));
const bossHp = lvl => Math.round(rawHp(lvl) * kindNum('boss', 'hp'));
const bossDps = lvl => (dmgBase + (lvl - 1) * dmgPer) * kindNum('boss', 'damage') / 2.4;

/* --------------------------- spending points --------------------------- */
/** Deep fills each skill in turn; wide puts a point in everything, round robin. */
function buildFor(level, order, wide = false) {
  const ranks = {};
  let left = pointsForLevel(level);
  const canTake = id => {
    const n = NODE_BY_ID[id];
    return level >= n.reqLevel && (ranks[id] || 0) < n.maxRank
      && n.requires.every(r => ranks[r] > 0);
  };
  if (wide) {
    let progress = true;
    while (left > 0 && progress) {
      progress = false;
      for (const id of order) {
        if (left <= 0) break;
        if (!canTake(id)) continue;
        ranks[id] = (ranks[id] || 0) + 1; left--; progress = true;
      }
    }
  } else {
    for (const id of order) {
      while (left > 0 && canTake(id)) { ranks[id] = (ranks[id] || 0) + 1; left--; }
    }
  }
  return { ranks, left };
}

/* ------------------------------ the fight ------------------------------ */
/** One fight against `targets` enemies of `hp` each. Returns seconds to clear. */
function fight(level, ranks, hp, targets = 1, cap = 60, gear = 1) {
  const p = passiveTotals(ranks);
  const maxHp = Math.round(baseHp(level) * (1 + p.maxLife));
  const maxStam = 100;
  const attackSpeed = 1 + p.attackSpeed;
  const critFactor = 1 + Math.min(1, 0.12 + p.crit) * 0.8;   // crit is 1.8x

  const actives = NODES.filter(n => n.kind === 'active' && ranks[n.id] > 0)
    .map(n => ({ node: n, a: ABILITY_BY_ID[n.ability], mult: skillPower(n.id, ranks) }));
  // press the biggest hitter first; buffs before damage so they multiply it
  const damaging = actives.filter(x => !['heal', 'buff'].includes(x.a.kind))
    .sort((a, b) => b.a.power * b.mult - a.a.power * a.mult);
  const buffs = actives.filter(x => x.a.kind === 'buff');

  const cd = {};
  let stam = maxStam, rage = 0, t = 0, busy = 0, pending = null;
  let pool = Array.from({ length: targets }, () => hp);
  const alive = () => pool.filter(x => x > 0).length;

  const damageStat = () => Math.round(baseDamage(level, gear) * (1 + p.weaponDamage) * (1 + rage / 100));
  const hit = (amount, many) => {
    let n = 0;
    for (let i = 0; i < pool.length && (many || n < 1); i++) {
      if (pool[i] <= 0) continue;
      pool[i] -= amount; n++;
    }
  };

  while (t < cap && alive() > 0) {
    t += DT;
    stam = Math.min(maxStam, stam + STAM_REGEN * DT);
    for (const k in cd) cd[k] = Math.max(0, cd[k] - DT);
    if (rage > 0) rage = Math.max(0, rage - 0);            // held by its timer below
    if (cd.__rage !== undefined && cd.__rage <= 0) rage = 0;

    if (pending && t >= pending.at) { hit(pending.dmg, false); pending = null; }
    if (busy > 0) { busy -= DT; continue; }

    // buffs first — they multiply everything that follows
    let acted = false;
    for (const b of buffs) {
      if (b.a.buff !== 'rage' || (cd[b.a.id] || 0) > 0) continue;
      rage = Math.min(b.a.cap, Math.round(b.a.power * 100 * b.mult));
      cd[b.a.id] = b.a.cooldown; cd.__rage = b.a.duration;
      busy = 0.05; acted = true; break;
    }
    if (acted) continue;
    if (cd.__rage !== undefined) { cd.__rage -= DT; if (cd.__rage <= 0) rage = 0; }

    for (const x of damaging) {
      if ((cd[x.a.id] || 0) > 0 || stam < x.a.stamina) continue;
      const dmg = Math.max(1, Math.round(damageStat() * x.a.power * x.mult));
      hit(dmg, x.a.kind === 'aoe');
      stam -= x.a.stamina; cd[x.a.id] = x.a.cooldown; busy = 0.46;
      acted = true; break;
    }
    if (acted) continue;

    if (stam >= SWING_COST) {                              // fall back on the sword
      const dur = SWING / attackSpeed;
      stam -= SWING_COST;
      pending = { at: t + dur * SWING_HIT, dmg: Math.max(1, Math.round(damageStat() * critFactor)) };
      busy = dur;
    }
  }
  return { time: alive() > 0 ? Infinity : +t.toFixed(2), maxHp };
}

/** The biggest number the build can put on the screen in one press. */
function bestHit(level, ranks, gear = 1) {
  const p = passiveTotals(ranks);
  let rage = 0;
  for (const n of NODES) {
    const a = ABILITY_BY_ID[n.ability];
    if (a && a.buff === 'rage' && ranks[n.id] > 0) {
      rage = Math.min(a.cap, Math.round(a.power * 100 * skillPower(n.id, ranks)));
    }
  }
  const stat = Math.round(baseDamage(level, gear) * (1 + p.weaponDamage) * (1 + rage / 100));
  let best = 0, id = '-';
  for (const n of NODES) {
    const a = ABILITY_BY_ID[n.ability];
    if (!a || !ranks[n.id] || ['heal', 'buff'].includes(a.kind)) continue;
    const d = Math.round(stat * a.power * skillPower(n.id, ranks));
    if (d > best) { best = d; id = n.id; }
  }
  return { best, id, rage };
}

const BUILDS = {
  'blade (klinge)': { order: ['hug', 'skarp', 'hvirvelvind', 'blodtorst', 'dommedag'] },
  'hunt (jagt)': { order: ['stormlob', 'fodfaeste', 'ildstod', 'praecision', 'kampraseri'] },
  'warden (vogter)': { order: ['haerdet', 'gengaeld', 'forbinding', 'stenhud', 'livskraft'] },
  'rage rush (the cheese)': { order: ['stormlob', 'ildstod', 'kampraseri', 'fodfaeste', 'praecision'] },
  'spread thin (a point in everything)': {
    wide: true,
    order: ['hug', 'stormlob', 'forbinding', 'skarp', 'fodfaeste', 'haerdet', 'hvirvelvind',
      'ildstod', 'stenhud', 'blodtorst', 'praecision', 'gengaeld', 'livskraft', 'kampraseri', 'dommedag'],
  },
  'no tree at all': { order: [] },
};

const total = NODES.reduce((a, n) => a + n.maxRank, 0);
console.log(`max level ${MAX_LEVEL}, ${pointsForLevel(MAX_LEVEL)} points at the cap`);
console.log(`whole tree costs ${total} points — you can afford `
  + `${Math.round(pointsForLevel(MAX_LEVEL) / total * 100)}% of it\n`);

console.log('Seconds to kill. "mob" is one same-level monster, "pack" is four of them,');
console.log('"boss" is the one in the crypt. The boss lands its first hit at 1.0s and its');
console.log('big one at 2.6s, so a boss fight under ~3s means it never got a turn.\n');

const rows = [];
for (const [name, spec] of Object.entries(BUILDS)) {
  for (const lvl of [6, 12, 18, 24, 30]) {
    const { ranks } = buildFor(lvl, spec.order, spec.wide);
    const mob = fight(lvl, ranks, monsterHp(lvl), 1);
    const pack = fight(lvl, ranks, monsterHp(lvl), 4);
    const boss = fight(lvl + 1, ranks, bossHp(lvl + 1), 1);
    const { best, id, rage } = bestHit(lvl, ranks);
    rows.push({
      name, lvl, pts: spentPoints(ranks), mob: mob.time, pack: pack.time, boss: boss.time,
      best, id, rage, hp: mob.maxHp,
      bossPct: Math.round(best / bossHp(lvl + 1) * 100),
      survive: +(mob.maxHp / bossDps(lvl + 1)).toFixed(1),
    });
  }
}

let last = '';
console.log('build                 lvl  pts    mob   pack   boss |  best hit        | %boss | life | survives');
for (const r of rows) {
  if (r.name !== last) { console.log('─'.repeat(103)); last = r.name; }
  console.log(
    `${r.name.padEnd(21)}${String(r.lvl).padStart(3)}${String(r.pts).padStart(5)}`
    + `${r.mob.toFixed(1).padStart(7)}s${r.pack.toFixed(1).padStart(6)}s${r.boss.toFixed(1).padStart(6)}s |`
    + ` ${(r.id + ' ' + r.best).padEnd(16)} |${String(r.bossPct).padStart(5)}% |`
    + `${String(r.hp).padStart(5)} |${String(r.survive).padStart(7)}s`);
}

console.log('\nWhat a point buys, at level 30, measured as boss kill time:');
const ref = buildFor(30, [], false).ranks;
const refT = fight(31, ref, bossHp(31), 1).time;
const marginal = [];
for (const n of NODES) {
  const ranks = {};
  // the cheapest legal way to reach this node, then fill it
  const chain = [];
  const walk = id => { for (const r of NODE_BY_ID[id].requires) walk(r); chain.push(id); };
  walk(n.id);
  for (const id of chain) ranks[id] = id === n.id ? n.maxRank : 1;
  const pts = spentPoints(ranks);
  const t = fight(31, ranks, bossHp(31), 1).time;
  marginal.push({ id: n.id, pts, gain: +((refT / t - 1) / pts * 100).toFixed(1) });
}
marginal.sort((a, b) => b.gain - a.gain);
for (const m of marginal) {
  console.log(`  ${m.id.padEnd(12)} ${String(m.pts).padStart(2)} pts  ${m.gain >= 0 ? '+' : ''}${m.gain}% dps per point`);
}


console.log('\nThe ceiling: level 30, every point spent, wearing a legendary (x2.1 weapon).');
console.log('This is the "frightening" end the tree is allowed to reach.');
for (const [name, spec] of Object.entries(BUILDS)) {
  if (name === 'no tree at all') continue;
  const { ranks } = buildFor(30, spec.order, spec.wide);
  const t = fight(31, ranks, bossHp(31), 1, 60, 2.1).time;
  const { best, id } = bestHit(30, ranks, 2.1);
  console.log(`  ${name.padEnd(36)} boss ${t.toFixed(1)}s   best ${id} ${best}`
    + ` (${Math.round(best / bossHp(31) * 100)}% of the boss)`);
}
