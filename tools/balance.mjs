// Balance report for the skill tree. Pure maths — no browser needed.
// Run: node tools/balance.mjs
import {
  NODES, NODE_BY_ID, MAX_LEVEL, pointsForLevel, skillPower, passiveTotals, spentPoints,
} from '../src/skilltree.js';

const ABILITY_BASE = {              // multiples of weapon damage, from abilities.js
  hug: 1.5, hvirvelvind: 1.1, stormlob: 1.3, ildstod: 1.7, dommedag: 2.4,
};
const COOLDOWN = { hug: 4, hvirvelvind: 9, stormlob: 11, ildstod: 12, dommedag: 55 };
const SWING = 0.52;                 // a plain sword swing

/** Two ways to spend: deep (fill each skill in turn) or wide (a point in each,
 *  round robin). Specialising should beat dabbling — that is the whole point. */
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
        ranks[id] = (ranks[id] || 0) + 1;
        left--;
        progress = true;
      }
    }
  } else {
    for (const id of order) {
      while (left > 0 && canTake(id)) { ranks[id] = (ranks[id] || 0) + 1; left--; }
    }
  }
  return { ranks, left };
}

const BUILDS = {
  'blade (klinge)': { order: ['hug', 'skarp', 'hvirvelvind', 'blodtorst', 'dommedag'] },
  'hunt (jagt)': { order: ['stormlob', 'fodfaeste', 'ildstod', 'praecision', 'kampraseri'] },
  'warden (vogter)': { order: ['haerdet', 'gengaeld', 'forbinding', 'stenhud', 'livskraft'] },
  'spread thin (a point in everything)': {
    wide: true,
    order: ['hug', 'stormlob', 'forbinding', 'skarp', 'fodfaeste', 'haerdet', 'hvirvelvind',
      'ildstod', 'stenhud', 'blodtorst', 'praecision', 'gengaeld', 'livskraft', 'kampraseri', 'dommedag'],
  },
};

// what the hero's plain damage looks like, ignoring the tree
const heroDamage = lvl => 6 + Math.round(5 + lvl * 1.6) + (lvl - 1) * 3;
const monsterHp = lvl => 30 + (lvl - 1) * 9;
const bossHp = lvl => Math.round((30 + (lvl - 1) * 9) * 12);

console.log(`max level ${MAX_LEVEL}, ${pointsForLevel(MAX_LEVEL)} points at the cap`);
console.log(`whole tree costs ${NODES.reduce((a, n) => a + n.maxRank, 0)} points — you can afford `
  + `${Math.round(pointsForLevel(MAX_LEVEL) / NODES.reduce((a, n) => a + n.maxRank, 0) * 100)}% of it\n`);

for (const [name, spec] of Object.entries(BUILDS)) {
  const { order, wide } = spec;
  console.log(`── ${name} ──`);
  console.log('lvl | pts |' + Object.keys(ABILITY_BASE).map(k => k.slice(0, 6).padStart(7)).join(' |')
    + ' | passives');
  for (const lvl of [6, 12, 18, 24, 30]) {
    const { ranks } = buildFor(lvl, order, wide);
    const p = passiveTotals(ranks);
    const cells = Object.entries(ABILITY_BASE).map(([id, base]) => {
      const mult = skillPower(id, ranks);
      if (!mult) return '     - ';
      const dmg = base * mult * heroDamage(lvl) * (1 + p.weaponDamage);
      return String(Math.round(dmg)).padStart(7);
    });
    const bits = [];
    if (p.weaponDamage) bits.push(`dmg+${Math.round(p.weaponDamage * 100)}%`);
    if (p.maxLife) bits.push(`life+${Math.round(p.maxLife * 100)}%`);
    if (p.crit) bits.push(`crit+${Math.round(p.crit * 100)}%`);
    if (p.lifesteal) bits.push(`steal ${(p.lifesteal * 100).toFixed(1)}%`);
    console.log(`${String(lvl).padStart(3)} | ${String(spentPoints(ranks)).padStart(3)} |`
      + cells.join(' |') + ' | ' + bits.join(' '));
  }
  // sustained output is the fair comparison: a 55s finisher is not a rotation
  const { ranks } = buildFor(MAX_LEVEL, order, wide);
  const p = passiveTotals(ranks);
  let best = 0, bestId = '-';
  for (const [id, base] of Object.entries(ABILITY_BASE)) {
    const dmg = base * skillPower(id, ranks) * heroDamage(MAX_LEVEL) * (1 + p.weaponDamage);
    if (dmg > best) { best = dmg; bestId = id; }
  }
  const mob = monsterHp(MAX_LEVEL + 1), boss = bossHp(MAX_LEVEL + 1);
  const wd = heroDamage(MAX_LEVEL) * (1 + p.weaponDamage) * (1 + p.crit * 0.8);
  let dps = wd / SWING * (1 + p.attackSpeed);          // basic attacks, always available
  for (const [id, base] of Object.entries(ABILITY_BASE)) {
    const m = skillPower(id, ranks);
    if (m) dps += base * m * wd / COOLDOWN[id];
  }
  console.log(`  at ${MAX_LEVEL}: best single hit ${bestId} ${Math.round(best)} `
    + `(${(best / mob).toFixed(1)}x a normal monster, ${Math.round(best / boss * 100)}% of the boss)`);
  console.log(`  sustained ~${Math.round(dps)}/s → boss in ~${Math.round(boss / dps)}s`
    + `, life +${Math.round(p.maxLife * 100)}%\n`);
}
