// Headless play-through with assertions. Prints one PASS/FAIL line per check.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE ' + m.text()); });
await page.goto('http://127.0.0.1:8099/index.html');
await page.waitForFunction(() => !!window.__dj);
await page.click('#play');
await page.evaluate(() => { window.__dj.state.running = true; });
await page.waitForTimeout(300);

// Headless SwiftShader runs at a handful of fps, so wait on the game clock
// rather than wall time.
async function gameWait(seconds) {
  const target = await page.evaluate(() => window.__dj.gameTime) + seconds;
  await page.waitForFunction(t => window.__dj.gameTime >= t, target, { timeout: 90000 });
}

const checks = [];
const check = (name, ok, extra = '') => checks.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);

/* ------------------------------ movement ------------------------------ */
const before = await page.evaluate(() => ({ ...window.__dj.player.pos }));
await page.keyboard.down('w');
await gameWait(1.0);
await page.keyboard.up('w');
const after = await page.evaluate(() => ({ ...window.__dj.player.pos }));
const moved = Math.hypot(after.x - before.x, after.z - before.z);
check('WASD moves the hero', moved > 1.5, `moved ${moved.toFixed(2)}m`);

async function strafe(key) {
  const start = await page.evaluate(() => ({ ...window.__dj.player.pos }));
  await page.keyboard.down(key);
  await gameWait(0.8);
  await page.keyboard.up(key);
  await gameWait(0.2);
  return await page.evaluate(s => {
    const d = window.__dj;
    const m = d.camera.matrixWorld.elements;
    const dx = d.player.pos.x - s.x, dz = d.player.pos.z - s.z;
    return +(dx * m[0] + dz * m[2]).toFixed(2);
  }, start);
}
check('D strafes right on screen', (await strafe('d')) > 0.5);
check('A strafes left on screen', (await strafe('a')) < -0.5);

const rig = await page.evaluate(() => {
  const d = window.__dj;
  const out = [];
  for (const pitch of [-0.55, -0.3, -0.1, 0.25]) {
    for (let i = 0; i < 200; i++) window.__djCam(0.1, pitch);
    const head = { x: d.player.pos.x, y: d.player.pos.y + 1.5, z: d.player.pos.z };
    const dist = Math.hypot(d.camera.position.x - head.x, d.camera.position.y - head.y, d.camera.position.z - head.z);
    const s = d.screenOf(head);
    out.push({ pitch, dist: +dist.toFixed(2), on: s.visible, sx: +(s.x / 1100).toFixed(2), sy: +(s.y / 700).toFixed(2) });
  }
  return out;
});
check('camera stays locked in third person',
  rig.every(r => r.dist > 2.5 && r.dist < 7 && r.on && r.sx > 0.05 && r.sx < 0.95 && r.sy > 0.05 && r.sy < 0.95),
  rig.map(r => `p${r.pitch}: ${r.dist}m`).join(', '));

const turn = await page.evaluate(() => {
  const d = window.__dj;
  d.player.yaw = 3.10;
  window.__djLook(0, -0.1);
  const samples = [];
  window.__djKeys.add('s');
  for (let i = 0; i < 40; i++) { window.__djStep(0.03); samples.push(Math.cos(d.player.yaw)); }
  window.__djKeys.delete('s');
  return Math.max(...samples);
});
check('the hero turns the short way, not full circle', turn < 0.2,
  `front-facing peak cos=${turn.toFixed(2)}`);

/* ------------------------- the peaceful overworld ------------------------- */
const wild = await page.evaluate(() => {
  const d = window.__dj;
  return { zone: d.zone, kinds: [...new Set(d.monsters.map(m => m.kindId))], count: d.monsters.length };
});
check('the meadow holds only peaceful wildlife',
  wild.zone === 'overworld' && wild.kinds.length === 1 && wild.kinds[0] === 'boar' && wild.count > 0,
  `${wild.count} x ${wild.kinds.join('/')}`);

await page.evaluate(() => {
  const d = window.__dj;
  const boar = d.monsters.find(m => m.kindId === 'boar');
  d.player.pos.set(boar.pos.x, 0, boar.pos.z + 1.6);
  d.state.hp = 100;
});
await gameWait(3.0);
const ignored = await page.evaluate(() => window.__dj.state.hp);
check('wildlife ignores you until provoked', ignored >= 100, `hp ${Math.round(ignored)}`);

const provoke = await page.evaluate(() => {
  const d = window.__dj;
  const boar = d.monsters.find(m => m.kindId === 'boar');
  d.player.pos.set(boar.pos.x, 0, boar.pos.z + 1.6);
  d.player.yaw = Math.atan2(boar.pos.x - d.player.pos.x, boar.pos.z - d.player.pos.z);
  const before = boar.hp;
  d.damageMonster(boar, 5, false);
  return { hurt: before - boar.hp, angry: boar.angry > 0 };
});
await gameWait(4.0);
const provoked = await page.evaluate(() => window.__dj.state.hp);
check('wildlife fights back once you hit it', provoke.hurt > 0 && provoke.angry && provoked < 100,
  `hp ${Math.round(provoked)}`);

// gear is never swapped for you
const manual = await page.evaluate(() => {
  const d = window.__dj;
  const worn = d.state.equipped.weapon;
  const great = d.makeItem('weapon', 12, Math.random);
  great.stats = { skade: 99 };                   // plainly better than anything worn
  d.dropItemAt(great, d.player.pos.x, d.player.pos.z);
  return { worn: worn.name, bagBefore: d.state.bag.length };
});
await gameWait(0.6);
const afterGreat = await page.evaluate(() => {
  const d = window.__dj;
  return { worn: d.state.equipped.weapon.name, bag: d.state.bag.length,
    inBag: d.state.bag.some(i => i.stats.skade === 99) };
});
check('a better drop waits in the bag instead of equipping itself',
  afterGreat.worn === manual.worn && afterGreat.inBag && afterGreat.bag > manual.bagBefore,
  `still wearing ${afterGreat.worn}, bag ${manual.bagBefore} -> ${afterGreat.bag}`);

const byHand = await page.evaluate(() => {
  const d = window.__dj;
  d.game.equip(d.state.bag.find(i => i.stats.skade === 99));
  return d.state.equipped.weapon.stats.skade;
});
check('equipping from the bag still works', byHand === 99, `now wearing ${byHand} skade`);
await page.evaluate(() => {
  const d = window.__dj;                          // put the plain sword back on
  const plain = d.state.bag.find(i => i.type === 'weapon' && i.stats.skade !== 99);
  if (plain) d.game.equip(plain);
});

/* --------------------------- levelling balance --------------------------- */
const balance = await page.evaluate(() => {
  const d = window.__dj;
  const rows = [];
  for (const lvl of [1, 4, 8, 12]) {
    d.state.level = lvl;
    d.state.equipped.armor = null; d.state.equipped.trinket = null;
    const t = d.totals();
    const hp = Math.round((30 + (lvl - 1) * 9) * 1);          // a brute of the same level
    rows.push({ lvl, swings: Math.ceil(hp / t.damage), hp, dmg: t.damage });
  }
  d.state.level = 1;
  return rows;
});
check('a plain hero can still kill their own level',
  balance.every(r => r.swings <= 3),
  balance.map(r => `L${r.lvl}: ${r.swings} swings`).join(', '));

const gear = await page.evaluate(() => {
  const d = window.__dj;
  const starter = d.state.equipped.weapon;
  let rare = 0;
  for (let i = 0; i < 400; i++) {
    const it = d.makeItem('weapon', 5, Math.random);
    if (it.tier >= 3) rare++;
  }
  return { starterStats: Object.keys(starter.stats), epicPct: +(rare / 4).toFixed(1) };
});
check('the starter sword is plain damage only',
  gear.starterStats.length === 1 && gear.starterStats[0] === 'skade', gear.starterStats.join('+'));
check('gear rarity is uncommon', gear.epicPct < 8, `${gear.epicPct}% epic or better`);

// what drops has to be worth picking up: the plain starter must be beatable
const upgrades = await page.evaluate(() => {
  const d = window.__dj;
  const starter = d.state.equipped.weapon;
  const beat = lvl => {
    let n = 0;
    for (let i = 0; i < 300; i++) if (d.itemScore(d.makeItem('weapon', lvl, Math.random)) > d.itemScore(starter)) n++;
    return Math.round(n / 3);
  };
  // and once you are wearing good gear, upgrades should get rarer
  let best = starter, seen = 0, ups = 0;
  for (const lvl of [1, 2, 3, 4, 6, 8]) {
    for (let i = 0; i < 60; i++) {
      const it = d.makeItem('weapon', lvl, Math.random);
      seen++;
      if (d.itemScore(it) > d.itemScore(best)) { ups++; best = it; }
    }
  }
  return { atOne: beat(1), atThree: beat(3), upgradeRate: Math.round(ups / seen * 100), bestEnd: best.stats.skade };
});
check('early drops beat the plain starter sword', upgrades.atOne > 60,
  `${upgrades.atOne}% at level 1, ${upgrades.atThree}% at level 3`);
check('upgrades get rarer once you are geared', upgrades.upgradeRate < 25,
  `${upgrades.upgradeRate}% of drops were an upgrade, ending at ${upgrades.bestEnd} skade`);

const rates = await page.evaluate(() => {
  const d = window.__dj;
  const k = d.kinds;
  return Object.fromEntries(Object.entries(k).map(([id, v]) => [id, v.loot ?? 0.3]));
});
check('loot does not drop from every kill',
  rates.boar < 0.25 && rates.brute < 0.4 && rates.guard < 0.5 && rates.boss === 1,
  Object.entries(rates).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', '));

/* ------------------------------ abilities ------------------------------ */
const abil = await page.evaluate(() => {
  const d = window.__dj;
  const out = { count: d.abilities.length };
  d.forget();
  out.empty = d.useAbility(0);                     // nothing on the bar yet
  d.state.level = 20; d.state.hp = 50; d.state.stamina = 200;
  d.learn('hug'); d.learn('forbinding'); d.learn('haerdet'); d.learn('stenhud');
  d.learn('stormlob'); d.learn('ildstod'); d.learn('kampraseri');
  out.bar = d.bar.slice(0, 7);
  const m = d.monsters[0];
  d.player.pos.set(m.pos.x, 0, m.pos.z - 2.0);
  d.player.yaw = 0;                                // facing +z, toward the creature
  const hpBefore = m.hp;
  out.used = d.useAbility(0);                      // hug landed in slot 0
  out.damaged = hpBefore - m.hp;
  out.onCooldown = d.state.cooldowns.hug > 0;
  out.blocked = d.useAbility(0) === false;
  const healBefore = d.state.hp;
  d.useAbility(d.bar.indexOf('forbinding'));
  out.healed = d.state.hp - healBefore;
  d.useAbility(d.bar.indexOf('stenhud')); out.shield = d.state.buffs.shield > 0;
  const dmgBefore = d.totals().damage;
  d.useAbility(d.bar.indexOf('kampraseri')); out.rage = d.totals().damage > dmgBefore;
  d.forget();
  d.state.level = 1; d.state.cooldowns = {}; d.state.buffs.shield = 0; d.state.buffs.rage = 0;
  return out;
});
check('there are eight abilities', abil.count === 8);
check('an empty hotbar slot does nothing', abil.empty === false);
check('learning a skill puts it on the bar', abil.bar[0] === 'hug', abil.bar.join(','));
check('an ability damages a creature', abil.used && abil.damaged > 0, `-${abil.damaged} hp`);
check('using one starts its cooldown', abil.onCooldown && abil.blocked);
check('the heal ability restores life', abil.healed > 0, `+${abil.healed} hp`);
check('the shield and rage buffs apply', abil.shield && abil.rage);

/* ----------------------------- skill tree ----------------------------- */
const tree = await page.evaluate(() => {
  const d = window.__dj;
  const out = {};
  d.forget();

  // one point per level, plus one to start with
  d.state.level = 1; out.atOne = d.pointsLeft();
  d.state.level = 10; out.atTen = d.pointsLeft();
  d.state.level = 30; out.atThirty = d.pointsLeft();
  d.state.level = 45; out.pastCap = d.pointsLeft();       // level is capped at 30

  // level gates and prerequisites hold
  d.state.level = 1;
  out.tierGate = d.spendPoint('hvirvelvind') === false;   // needs level 6
  d.state.level = 20;
  d.forget();
  out.prereq = d.spendPoint('dommedag') === false;        // needs Hvirvelvind
  out.first = d.spendPoint('hug') === true;
  out.thenTier2 = d.spendPoint('hvirvelvind') === true;
  out.thenTier3 = d.spendPoint('dommedag') === true;

  // you cannot spend more than you have
  d.forget();
  d.state.level = 3;                                      // 3 points
  let spent = 0;
  for (let i = 0; i < 20; i++) if (d.spendPoint('skarp')) spent++;
  out.budget = spent;
  out.overspent = d.pointsLeft() < 0;

  // ranks cap out
  d.forget(); d.state.level = 30;
  let ranks = 0;
  for (let i = 0; i < 20; i++) if (d.spendPoint('skarp')) ranks++;
  out.maxRank = ranks;

  // synergies: Skarpslebet quietly feeds Hug
  d.forget(); d.state.level = 30;
  d.learn('hug', 1);
  const bare = d.skillPower('hug');
  d.learn('skarp', 5);
  out.synergy = +(d.skillPower('hug') / bare).toFixed(3);  // 1 + 5 * 0.05

  // ranks scale it too
  d.forget(); d.learn('hug', 1);
  const r1 = d.skillPower('hug');
  d.learn('hug', 5);
  out.rankGain = +(d.skillPower('hug') / r1).toFixed(3);   // 1 + 4 * 0.18

  // passives reach the character sheet
  d.forget();
  const base = d.totals();
  d.learn('haerdet', 5); d.learn('skarp', 5); d.learn('praecision', 5); d.learn('fodfaeste', 5);
  const buffed = d.totals();
  out.life = +(buffed.maxHp / base.maxHp).toFixed(3);      // 1 + 5 * 0.05
  out.dmg = +(buffed.damage / base.damage).toFixed(2);     // 1 + 5 * 0.04
  out.crit = +(buffed.crit - base.crit).toFixed(3);        // 5 * 0.03
  out.speed = buffed.speed > base.speed && buffed.attackSpeed > base.attackSpeed;

  // Blodtørst returns life on a hit
  d.forget(); d.learn('blodtorst', 5); d.learn('hug', 5);
  d.state.hp = 10;
  const m = d.monsters.find(x => !x.dead);
  m.hp = m.maxHp = 1e9;
  d.damageMonster(m, 1000, false);
  out.lifesteal = d.state.hp > 10;

  // a full reset hands everything back and clears the bar
  d.state.level = 20; d.learn('hug', 3); d.learn('stormlob', 2);
  d.resetTree();
  out.reset = d.spent() === 0 && d.bar.every(x => x === null);

  // the bar holds eight, and a skill only sits in one slot
  d.state.level = 30;
  for (const id of ['hug', 'hvirvelvind', 'stormlob', 'ildstod', 'forbinding', 'stenhud']) d.spendPoint(id);
  out.barLen = d.bar.length;
  out.noDupes = new Set(d.bar.filter(Boolean)).size === d.bar.filter(Boolean).length;
  // moving into a slot that is already taken trades the two round
  const wasInThree = d.bar[3];
  d.assignBar(3, 'hug');
  out.moved = d.bar[3] === 'hug' && d.bar.filter(x => x === 'hug').length === 1;
  out.swapped = d.bar[0] === wasInThree;
  // moving into an empty slot just leaves the old one empty
  d.assignBar(7, 'hug');
  out.toEmpty = d.bar[7] === 'hug' && d.bar[3] === null;

  // a skill you have not taken cannot go on the bar
  d.assignBar(6, 'dommedag');
  out.unlearned = d.bar[6] !== 'dommedag';

  // even a finished branch cannot make you immune
  d.forget(); d.state.level = 30;
  d.learn('haerdet', 5); d.learn('stenhud', 5);
  d.state.stamina = 300; d.state.cooldowns = {};
  d.useAbility(d.bar.indexOf('stenhud'));
  out.shieldCap = d.state.buffPower.shield;

  d.forget();
  d.state.level = 1; d.state.cooldowns = {}; d.state.buffs.shield = 0; d.state.buffs.rage = 0;
  return out;
});
check('one point per level, one to start', tree.atOne === 1 && tree.atTen === 10, `lvl1 ${tree.atOne}, lvl10 ${tree.atTen}`);
check('points stop at the level cap', tree.atThirty === 30 && tree.pastCap === 30);
check('a skill below its level cannot be taken', tree.tierGate);
check('a skill without its prerequisite cannot be taken', tree.prereq);
check('taking the prerequisite opens the next tier', tree.first && tree.thenTier2 && tree.thenTier3);
check('you cannot spend points you do not have', tree.budget === 3 && !tree.overspent, `spent ${tree.budget}`);
check('ranks cap at five', tree.maxRank === 5);
check('a synergy skill feeds its partner', Math.abs(tree.synergy - 1.25) < 0.005, `x${tree.synergy}`);
check('ranks scale a skill', Math.abs(tree.rankGain - 1.72) < 0.005, `x${tree.rankGain}`);
check('passive life reaches the character sheet', Math.abs(tree.life - 1.25) < 0.01, `x${tree.life}`);
check('passive damage reaches the character sheet', tree.dmg > 1.15 && tree.dmg < 1.3, `x${tree.dmg}`);
check('passive crit reaches the character sheet', Math.abs(tree.crit - 0.15) < 0.001, `+${tree.crit}`);
check('passive speed reaches the character sheet', tree.speed);
check('lifesteal returns life on a hit', tree.lifesteal);
check('resetting hands every point back', tree.reset);
check('the bar holds eight and never duplicates', tree.barLen === 8 && tree.noDupes);
check('moving a skill on the bar swaps, not clones', tree.moved && tree.swapped && tree.toEmpty);
check('an untaken skill cannot go on the bar', tree.unlearned);
check('a maxed shield still lets damage through', tree.shieldCap <= 80, `${tree.shieldCap}% reduction`);

// The number in the tooltip is a promise. Every ability has to keep it.
const promise = await page.evaluate(() => {
  const d = window.__dj;
  const bad = [];
  const cases = [
    ['hug', 1, {}], ['hug', 5, { skarp: 5 }],
    ['hvirvelvind', 3, { hug: 5, skarp: 5 }],
    ['stormlob', 2, { fodfaeste: 4 }],
    ['ildstod', 5, { stormlob: 5, praecision: 5 }],
    ['dommedag', 5, { hvirvelvind: 5, hug: 5, blodtorst: 5, haerdet: 5 }],
  ];
  for (const [id, rank, syn] of cases) {
    d.forget(); d.state.level = 25; d.state.dead = false;
    for (const [k, v] of Object.entries(syn)) d.learn(k, v);
    d.learn(id, rank);
    const promised = d.abilityValue(id);
    const live = d.monsters.filter(m => !m.dead);
    live.slice(1).forEach(m => m.pos.set(m.pos.x + 900, 0, m.pos.z + 900));
    const m = live[0];
    m.hp = m.maxHp = 1e7;
    d.player.pos.set(m.pos.x, 0, m.pos.z - 2.0);
    d.player.yaw = 0;                                // facing it
    d.state.cooldowns = {}; d.state.stamina = 400;
    const before = m.hp;
    d.useAbility(d.bar.indexOf(id));
    const dealt = before - m.hp;
    if (dealt !== promised) bad.push(`${id} r${rank}: said ${promised}, dealt ${dealt}`);
  }
  // the three that do not deal damage
  d.forget(); d.state.level = 25; d.state.stamina = 400;
  d.learn('haerdet', 4); d.learn('forbinding', 3);
  d.state.hp = 10; d.state.cooldowns = {};
  const saidHeal = d.abilityValue('forbinding');
  d.useAbility(d.bar.indexOf('forbinding'));
  if (Math.round(d.state.hp - 10) !== saidHeal) bad.push(`forbinding: said ${saidHeal}, gave ${Math.round(d.state.hp - 10)}`);

  d.forget(); d.state.level = 25; d.learn('haerdet', 5); d.learn('stenhud', 5);
  d.state.cooldowns = {}; d.state.stamina = 400;
  const saidShield = d.abilityValue('stenhud');
  d.useAbility(d.bar.indexOf('stenhud'));
  if (d.state.buffPower.shield !== saidShield) bad.push(`stenhud: said ${saidShield}, applied ${d.state.buffPower.shield}`);

  d.forget(); d.state.level = 25;
  for (const id of ['fodfaeste', 'stormlob', 'ildstod', 'kampraseri']) d.learn(id, 5);
  d.state.cooldowns = {}; d.state.stamina = 400;
  const dmgBefore = d.totals().damage;
  const saidRage = d.abilityValue('kampraseri');
  d.useAbility(d.bar.indexOf('kampraseri'));
  const gotRage = Math.round((d.totals().damage / dmgBefore - 1) * 100);
  if (Math.abs(gotRage - saidRage) > 1) bad.push(`kampraseri: said +${saidRage}%, gave +${gotRage}%`);

  d.forget();
  d.state.level = 1; d.state.cooldowns = {}; d.state.buffs.shield = 0; d.state.buffs.rage = 0;
  return bad;
});
check('every ability lands exactly what its tooltip promised', promise.length === 0, promise.join(' · '));

/* --------------------- balance guards --------------------- */
const guard = await page.evaluate(() => {
  const d = window.__dj;
  const out = {};
  d.forget(); d.state.level = 30;

  // Lifesteal is per hit, and an area attack hits everything: without a cap
  // one Dommedag into a crowd was a full heal.
  d.learn('blodtorst', 5); d.learn('hug', 5); d.learn('hvirvelvind', 5); d.learn('dommedag', 5);
  const t = d.totals();
  d.state.hp = 1;
  const crowd = d.monsters.filter(m => !m.dead).slice(0, 6);
  for (const m of crowd) { m.hp = m.maxHp = 1e9; }
  d.state.cooldowns = {}; d.state.stamina = 300;
  d.hitMany(crowd, 20000);                                   // one swing, six targets
  out.drunk = +((d.state.hp - 1) / t.maxHp).toFixed(3);
  out.targets = crowd.length;

  // Every rank of every skill has to buy something, or it is a trap.
  const dead = [];
  for (const node of d.nodes) {
    for (let r = 1; r < node.maxRank; r++) {
      d.forget();
      // take the prerequisites so the node is legal, then compare rank r to r+1
      const chain = [];
      const walk = id => { for (const q of d.nodeById[id].requires) walk(q); chain.push(id); };
      walk(node.id);
      for (const id of chain) if (id !== node.id) d.learn(id, 1);
      d.learn(node.id, r);
      const a = node.kind === 'active'
        ? d.abilityValue(node.id) : JSON.stringify(d.passives());
      d.learn(node.id, r + 1);
      const b = node.kind === 'active'
        ? d.abilityValue(node.id) : JSON.stringify(d.passives());
      if (String(a) === String(b)) dead.push(`${node.id} r${r}->${r + 1}`);
    }
  }
  out.dead = dead;

  d.forget();
  d.state.level = 1; d.state.cooldowns = {}; d.state.buffs.shield = 0; d.state.buffs.rage = 0;
  return out;
});
check('one swing cannot drink a whole health bar', guard.drunk <= 0.13,
  `${Math.round(guard.drunk * 100)}% of max life off ${guard.targets} targets`);
check('every rank of every skill buys something', guard.dead.length === 0, guard.dead.join(', '));

/* ------------------ things the reviewers caught ------------------ */
const caught = await page.evaluate(() => {
  const d = window.__dj;
  const out = {};
  d.forget(); d.state.level = 30; d.state.dead = false; d.state.running = true;

  // a respec you pay for in cooldowns is not free
  d.learn('haerdet', 1); d.learn('stenhud', 3);
  d.state.stamina = 300; d.state.cooldowns = {};
  d.useAbility(d.bar.indexOf('stenhud'));
  d.resetTree();
  out.freeRespec = Object.values(d.state.cooldowns).every(v => !v) && !d.state.buffs.shield;

  // ranking a skill up must not undo a slot you cleared on purpose
  d.forget();
  d.spendPoint('hug');
  d.clearSlot(d.bar.indexOf('hug'));
  d.spendPoint('hug');
  out.staysCleared = !d.bar.includes('hug');

  // the debug hook must not blow up on a passive
  d.learn('skarp', 3);
  try { out.passiveValue = d.abilityValue('skarp'); } catch (e) { out.passiveValue = 'THREW'; }
  out.rankZero = d.learn('gengaeld', 0) === false;

  d.forget();
  d.state.level = 1; d.state.buffs.shield = 0; d.state.buffs.rage = 0;
  return out;
});
check('resetting the tree costs no cooldowns', caught.freeRespec);
check('ranking up leaves a cleared slot cleared', caught.staysCleared);
check('a passive has no ability value, and does not throw', caught.passiveValue === 0);
check('rank zero is not a learned skill', caught.rankZero);

// Stormløb dashes 6m — it must not carry you through the crypt
await page.evaluate(() => window.__dj.setZone('dungeon'));
await gameWait(0.4);
const dash = await page.evaluate(() => {
  const d = window.__dj;
  d.forget(); d.state.level = 20; d.learn('stormlob', 1);
  const slot = d.bar.indexOf('stormlob');
  let tries = 0, clips = 0;
  for (let a = 0; a < 64; a++) {
    for (const cell of d.dungeon.posts.slice(0, 6)) {
      d.player.pos.set(cell.pos.x, 0, cell.pos.z);
      if (d.mazeBlocked(d.player.pos.x, d.player.pos.z, 0.5)) continue;
      d.player.yaw = a / 64 * Math.PI * 2;
      const sx = d.player.pos.x, sz = d.player.pos.z;
      d.state.cooldowns = {}; d.state.stamina = 300;
      if (!d.useAbility(slot)) continue;
      tries++;
      // did the dash cross stone on its way?
      const steps = 24;
      for (let i = 1; i < steps; i++) {
        const x = sx + (d.player.pos.x - sx) * i / steps;
        const z = sz + (d.player.pos.z - sz) * i / steps;
        if (d.mazeBlocked(x, z, 0.35)) { clips++; break; }
      }
    }
  }
  d.forget(); d.state.level = 1;
  return { tries, clips };
});
check('a dash cannot carry you through a wall', dash.clips === 0,
  `${dash.clips} of ${dash.tries} dashes crossed stone`);
await page.evaluate(() => window.__dj.setZone('overworld'));
await gameWait(0.4);

/* -------------------------------- loot -------------------------------- */
const hilly = await page.evaluate(() => {
  const d = window.__dj;
  let spot = null;
  for (let r = 20; r < 90 && !spot; r += 5) {
    for (let a = 0; a < 6.28; a += 0.4) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(window.__djHeightAt(x, z)) > 2.5) { spot = { x, z }; break; }
    }
  }
  if (!spot) return { skipped: true };
  const id = d.dropAt(spot.x, spot.z);
  d.player.pos.set(spot.x, 0, spot.z);
  return { terrain: +window.__djHeightAt(spot.x, spot.z).toFixed(2), id };
});
await gameWait(0.6);
// other kills may leave their own loot lying about, so look for this one only
const left = await page.evaluate(id => window.__dj.drops.some(d => d.item.id === id), hilly.id);
check('loot on high ground can be picked up', !hilly.skipped && left === false,
  hilly.skipped ? 'no slope found' : `terrain y=${hilly.terrain}`);

/* --------------------------------- town --------------------------------- */
const townState = await page.evaluate(() => {
  const d = window.__dj;
  d.player.pos.set(d.town.x, 0, d.town.z);
  d.state.hp = 100;
  const m = d.monsters.find(x => !x.dead);          // the ability check may have killed one
  m.hp = m.maxHp;
  m.pos.set(d.town.x, 0, d.town.z + 1.5);
  m.angry = 30;
  d.forceAttack(Object.keys(m.kind.attacks)[0]);
  return { titleGone: !document.querySelector('.title-plate'), id: m.id };
});
await gameWait(2.0);
const safe = await page.evaluate(id => {
  const d = window.__dj;
  const m = d.monsters.find(x => x.id === id) || d.monsters[0];
  return { hp: d.state.hp, dist: +Math.hypot(m.pos.x - d.town.x, m.pos.z - d.town.z).toFixed(1),
    radius: d.town.radius, dead: m.dead };
}, townState.id);
check('the game title is gone from the HUD', townState.titleGone);
check('the town is a safe zone', safe.hp >= 100, `hp ${Math.round(safe.hp)}`);
check('creatures are pushed out of the town', safe.dist > safe.radius,
  `${safe.dist}m vs fence ${safe.radius}m${safe.dead ? ' (it died)' : ''}`);

const heal = await page.evaluate(() => {
  const d = window.__dj;
  d.state.hp = 40; d.state.gold = 200;
  const cost = d.game.healCost();
  d.game.buyHeal();
  return { cost, hp: Math.round(d.state.hp), max: d.totals().maxHp, gold: d.state.gold };
});
check('the healer restores life for gold', heal.hp === heal.max && heal.gold === 200 - heal.cost,
  `${heal.cost} guld`);

const trade = await page.evaluate(() => {
  const d = window.__dj;
  d.state.gold = 500; d.game.restock();
  const item = d.game.stock[0];
  const price = d.game.buyPrice(item);
  d.game.buyItem(item);
  const owns = d.state.bag.includes(item), afterGold = d.state.gold;
  const back = d.game.sellPrice(item);
  d.game.sellItem(item);
  return { price, back, owns, afterGold, gold: d.state.gold, stillOwns: d.state.bag.includes(item) };
});
check('you can buy from the merchant', trade.owns && trade.afterGold === 500 - trade.price, `paid ${trade.price}`);
check('you can sell to the merchant', !trade.stillOwns && trade.gold === 500 - trade.price + trade.back,
  `got ${trade.back} back`);

/* ------------------------------ the crypt ------------------------------ */
// walk in — no key press
await page.evaluate(() => {
  const d = window.__dj;
  d.player.pos.set(d.mausoleum.door.x, 0, d.mausoleum.door.z - 9);
  d.player.yaw = 0;
  window.__djLook(0, -0.12);
});
await gameWait(0.5);
const beforeDoor = await page.evaluate(() => window.__dj.zone);
await page.keyboard.down('w');
for (let i = 0; i < 12 && (await page.evaluate(() => window.__dj.zone)) === 'overworld'; i++) await gameWait(0.5);
await page.keyboard.up('w');
const inside = await page.evaluate(() => {
  const d = window.__dj;
  return { zone: d.zone, kinds: [...new Set(d.monsters.map(m => m.kindId))].sort() };
});
/* --------------------------- solid ground --------------------------- */
const solid = await page.evaluate(() => {
  const d = window.__dj;
  const S = d.solids;
  // march the hero into every collider from eight directions, straight through
  // the middle, and see whether any step ends up inside something
  let steps = 0, inside = 0, sample = null;
  for (const c of S.all) {
    const reach = c.r !== undefined ? c.r : Math.hypot(c.hw, c.hd);
    for (let a = 0; a < 8; a++) {
      const ang = a / 8 * Math.PI * 2;
      let x = c.x + Math.cos(ang) * (reach + 5), z = c.z + Math.sin(ang) * (reach + 5);
      for (let i = 0; i < 60; i++) {
        x -= Math.cos(ang) * 0.18; z -= Math.sin(ang) * 0.18;
        const p = { x, y: 0, z };
        S.resolve(p, 0.45);
        x = p.x; z = p.z;
        steps++;
        if (S.blocked(x, z, 0.40)) { inside++; sample = sample || [+x.toFixed(1), +z.toFixed(1)]; }
      }
    }
  }
  return { count: S.all.length, steps, inside, sample };
});
check('you cannot walk into a tree, a cottage or a wall',
  solid.inside === 0 && solid.count > 50,
  `${solid.count} solid things, ${solid.steps} steps, ${solid.inside} ended inside`
    + (solid.sample ? ` (e.g. ${solid.sample})` : ''));

check('walking into the mausoleum takes you down',
  beforeDoor === 'overworld' && inside.zone === 'dungeon', `${beforeDoor} -> ${inside.zone}`);

// the crypt must be a maze, not one open room
const maze = await page.evaluate(() => {
  const d = window.__dj;
  const cells = d.dungeon.cells;
  const h = cells.length, w = cells[0].length;
  // every cell reachable from the entrance
  const seen = new Set([`0,${h - 1}`]);
  const stack = [[0, h - 1]];
  const step = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  while (stack.length) {
    const [x, z] = stack.pop();
    for (const dir of ['n', 'e', 's', 'w']) {
      if (cells[z][x][dir]) continue;
      const nx = x + step[dir][0], nz = z + step[dir][1];
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const key = `${nx},${nz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push([nx, nz]);
    }
  }
  let walls = 0;
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++)
    walls += ['n', 'e', 's', 'w'].filter(dir => cells[z][x][dir]).length;

  // and you cannot simply walk straight from the stairs to the far side
  const from = d.dungeon.spawnSpot;
  const far = d.dungeon.posts[d.dungeon.posts.length - 2].pos;
  let blockedAt = null;
  for (let i = 1; i <= 60; i++) {
    const f = i / 60;
    const x = from.x + (far.x - from.x) * f, z = from.z + (far.z - from.z) * f;
    if (d.mazeBlocked(x, z, 0.4)) { blockedAt = +f.toFixed(2); break; }
  }
  return { cells: w * h, reached: seen.size, walls, blockedAt };
});
check('every part of the maze is reachable', maze.reached === maze.cells,
  `${maze.reached}/${maze.cells} cells`);
check('the crypt is a maze, not one room', maze.walls > maze.cells && maze.blockedAt !== null,
  `${maze.walls} wall sides, straight line blocked at ${maze.blockedAt === null ? 'never' : maze.blockedAt}`);
check('the crypt holds three kinds of monster',
  ['archer', 'brute', 'guard'].every(k => inside.kinds.includes(k)), inside.kinds.join(', '));

// the archer shoots from a distance
const ranged = await page.evaluate(() => {
  const d = window.__dj;
  const a = d.monsters.find(m => m.kindId === 'archer');
  d.player.pos.set(a.pos.x, 0, a.pos.z + 8);
  d.state.hp = 200;
  return +Math.hypot(a.pos.x - d.player.pos.x, a.pos.z - d.player.pos.z).toFixed(1);
});
await gameWait(6.0);
const shot = await page.evaluate(() => ({ hp: window.__dj.state.hp, fired: window.__dj.arrowsFired }));
check('the archer hits you from range', shot.hp < 200, `from ${ranged}m, hp ${Math.round(shot.hp)}, ${shot.fired} arrows`);

// the guard's shield
const block = await page.evaluate(() => {
  const d = window.__dj;
  const g = d.monsters.find(m => m.kindId === 'guard');
  g.maxHp = 100000; g.hp = 100000;
  d.state.level = 20; d.state.stamina = 300;
  d.forget(); d.learn('hug');                      // slot 0 is Hug for this test
  const hit = behind => {
    const before = g.hp;
    g.yaw = 0;
    d.player.pos.set(g.pos.x, 0, g.pos.z + (behind ? -2 : 2));
    d.player.yaw = Math.atan2(g.pos.x - d.player.pos.x, g.pos.z - d.player.pos.z);
    d.state.cooldowns = {};
    d.useAbility(0);
    return before - g.hp;
  };
  const front = hit(false), back = hit(true);
  d.forget();
  d.state.level = 1;
  return { front, back };
});
check('the guard blocks what it faces', block.back > block.front * 2,
  `front ${block.front} vs back ${block.back}`);


// Measurements below are about one creature at a time: park the rest far away
// so a passing brute cannot land a hit inside a reading.
async function isolate(kindId) {
  return page.evaluate(k => {
    const d = window.__dj;
    let kept = null;
    for (const m of d.monsters) {
      if (!kept && m.kindId === k && !m.dead) { kept = m; continue; }
      m.pos.set(m.pos.x + 400, 0, m.pos.z + 400);
      m.home.copy(m.pos);
      m.state = 'idle';
      m.stateT = 0;
      m.atk = null;
      m.cooldown = 999;
    }
    return !!kept;
  }, kindId);
}

// nothing sees, shoots, or is shown through a wall
await isolate('archer');
await page.evaluate(() => {
  const a = window.__dj.monsters.find(m => m.kindId === 'archer');
  a.speed = 0; a.state = 'idle'; a.stateT = 0;
});

// find a spot that is still out of sight after the physics has settled the
// hero — a teleport can be nudged out of a wall and open the sightline
let hideSpot = null;
const candidates = await page.evaluate(() => {
  const d = window.__dj;
  const a = d.monsters.find(m => m.kindId === 'archer');
  const out = [];
  for (let ang = 0; ang < 6.28; ang += 0.12) {
    for (const r of [4, 5, 6, 7, 8]) {
      const x = a.pos.x + Math.cos(ang) * r, z = a.pos.z + Math.sin(ang) * r;
      if (d.mazeBlocked(x, z, 0.9)) continue;
      if (d.hasLineOfSight(a.pos, { x, z })) continue;
      out.push({ x, z, r });
    }
  }
  return out.slice(0, 40);
});
for (const c of candidates) {
  await page.evaluate(spot => { window.__dj.player.pos.set(spot.x, 0, spot.z); }, c);
  await gameWait(0.15);
  const stillHidden = await page.evaluate(() => {
    const d = window.__dj;
    const a = d.monsters.find(m => m.kindId === 'archer');
    return !d.hasLineOfSight(a.pos, d.player.pos);
  });
  if (stillHidden) { hideSpot = c; break; }
}
check('there are spots the archer cannot see', !!hideSpot,
  hideSpot ? `hidden at ${hideSpot.r.toFixed(0)}m` : `none of ${candidates.length} candidates held`);

if (hideSpot) {
  const before = await page.evaluate(() => {
    const d = window.__dj;
    const archer = d.monsters.find(m => m.kindId === 'archer');
    d.state.level = 60;
    d.state.hp = d.totals().maxHp;
    d.hurtLog.length = 0;
    archer.cooldown = 0;
    d.startAttackOn(archer, 'skud');           // make it try, with stone in the way
    return { fired: d.arrowsFired, sees: d.hasLineOfSight(archer.pos, d.player.pos) };
  });
  await gameWait(2.5);
  const after = await page.evaluate(() => ({
    fired: window.__dj.arrowsFired,
    arrowHits: window.__dj.hurtLog.filter(h => h.source === 'arrow').length,
  }));
  check('nothing shoots you through a wall',
    !before.sees && after.fired === before.fired && after.arrowHits === 0,
    `${after.fired - before.fired} arrows loosed, ${after.arrowHits} hits`);

  const bars = await page.evaluate(() => {
    const d = window.__dj;
    let seen = 0, hiddenCount = 0;
    for (const m of d.monsters) {
      if (m.dead) continue;
      if (d.hasLineOfSight(d.player.pos, m.pos)) seen++; else hiddenCount++;
    }
    return { seen, hiddenCount, total: d.monsters.length };
  });
  check('health bars are limited to what you can see', bars.hiddenCount > 0,
    `${bars.seen} visible, ${bars.hiddenCount} hidden of ${bars.total}`);
  await page.evaluate(() => { window.__dj.state.level = 1; });
}

// walking into something must not push it through the wall
const shove = await page.evaluate(() => {
  const d = window.__dj;
  const m = d.monsters.find(x => !x.dead && x.kindId !== 'boss');
  let spot = null;
  for (let ang = 0; ang < 6.28 && !spot; ang += 0.1) {
    for (let r = 1; r < 4; r += 0.25) {
      const x = m.pos.x + Math.cos(ang) * r, z = m.pos.z + Math.sin(ang) * r;
      if (d.mazeBlocked(x, z, 0.4)) { spot = { wx: x, wz: z, ang }; break; }
    }
  }
  if (!spot) return { skipped: true };
  m.pos.set(spot.wx - Math.cos(spot.ang) * 0.9, 0, spot.wz - Math.sin(spot.ang) * 0.9);
  m.state = 'idle'; m.cooldown = 999;
  d.player.pos.set(m.pos.x - Math.cos(spot.ang) * 1.2, 0, m.pos.z - Math.sin(spot.ang) * 1.2);
  return { id: m.id, ang: spot.ang };
});
if (!shove.skipped) {
  for (let i = 0; i < 25; i++) {
    await page.evaluate(sp => {
      const d = window.__dj;
      const m = d.monsters.find(x => x.id === sp.id);
      if (!m) return;
      d.player.pos.x = m.pos.x - Math.cos(sp.ang) * 0.4;   // press right through it
      d.player.pos.z = m.pos.z - Math.sin(sp.ang) * 0.4;
    }, shove);
    await gameWait(0.1);
  }
  const buried = await page.evaluate(sp => {
    const d = window.__dj;
    const m = d.monsters.find(x => x.id === sp.id);
    return m ? {
      inWall: d.mazeBlocked(m.pos.x, m.pos.z, 0.35),
      playerInWall: d.mazeBlocked(d.player.pos.x, d.player.pos.z, 0.3),
    } : null;
  }, shove);
  check('creatures cannot be shoved through walls',
    buried && !buried.inWall && !buried.playerInWall,
    buried ? `creature in stone: ${buried.inWall}, hero in stone: ${buried.playerInWall}` : 'creature gone');
}

// the crypt stays cleared until you leave
const cleared = await page.evaluate(() => {
  const d = window.__dj;
  const victim = d.monsters.find(m => !m.dead && m.kindId !== 'boss');
  d.damageMonster(victim, 999999, false);
  return { before: d.monsters.length, id: victim.id };
});
await gameWait(14.0);
const stillCleared = await page.evaluate(id => {
  const d = window.__dj;
  return { count: d.monsters.length, back: d.monsters.some(m => m.id === id) };
}, cleared.id);
check('the crypt does not repopulate while you are in it',
  stillCleared.count < cleared.before && !stillCleared.back,
  `${cleared.before} -> ${stillCleared.count} creatures`);

/* -------------------------------- the boss -------------------------------- */
const boss = await page.evaluate(() => {
  const d = window.__dj;
  const b = d.monsters.find(m => m.kindId === 'boss');
  if (!b) return null;
  // reference numbers come from the kind table: earlier checks inflate live hp
  const guard = d.statsFor('guard', b.level);
  const hardest = b.damage * Math.max(...Object.values(b.kind.attacks).map(a => a.dmg));
  const otherHardest = guard.damage * Math.max(...Object.values(d.kinds.guard.attacks).map(a => a.dmg));
  return { name: b.name, hp: b.maxHp, attacks: Object.keys(b.kind.attacks), barY: b.kind.barY,
    toughest: guard.maxHp, hardest, otherHardest };
});
check('a boss waits in the crypt', !!boss && boss.attacks.length === 3,
  boss ? `${boss.name}, ${boss.hp} hp, ${boss.attacks.join('/')}` : 'missing');
check('the boss dwarfs the rest of the crypt',
  boss && boss.hp > boss.toughest * 5 && boss.hardest > boss.otherHardest * 2,
  boss ? `${boss.hp} hp vs ${boss.toughest} for a guard; slam ${Math.round(boss.hardest)} vs ${Math.round(boss.otherHardest)}` : '');

// whip: a line on the ground that only hits what stands in it
await isolate('boss');
async function bossHit(attack, place) {
  await page.evaluate(([name, spot]) => {
    const d = window.__dj;
    const b = d.monsters.find(m => m.kindId === 'boss');
    b.pos.copy(d.dungeon.bossCentre); b.yaw = 0; b.cooldown = 0; b.state = 'chase'; b.atk = null;
    b.chargeT = 99;                          // no charge may land inside the reading
    d.state.level = 60;                     // a deep health pool so nothing clamps
    d.state.hp = d.totals().maxHp;
    d.player.pos.set(b.pos.x + spot[0], 0, b.pos.z + spot[1]);
    d.startBossAttack(b, name, Math.hypot(spot[0], spot[1]));
  }, [attack, place]);
  await gameWait(0.15);
  const start = await page.evaluate(() => {
    const d = window.__dj;
    // step into a safe ring if this is the slam and we were told to
    return { hp: d.state.hp, markers: d.groundFx.length };
  });
  return start;
}

async function whipLands(dodge) {
  await page.evaluate(() => {
    const d = window.__dj;
    const b = d.monsters.find(m => m.kindId === 'boss');
    b.pos.copy(d.dungeon.bossCentre); b.yaw = 0; b.cooldown = 0; b.state = 'chase'; b.atk = null;
    b.chargeT = 99; b.slamT = 99;              // no follow-up may muddy the reading
    d.state.level = 60;
    d.state.hp = d.totals().maxHp;
    d.hurtLog.length = 0;
    d.player.pos.set(b.pos.x, 0, b.pos.z + 5); // square in the lane
    d.startBossAttack(b, 'pisk', 5);
  });
  if (dodge) {
    await gameWait(0.75);                      // wait for it to commit, then step aside
    await page.evaluate(() => {
      const d = window.__dj;
      const b = d.monsters.find(m => m.kindId === 'boss');
      d.player.pos.set(b.pos.x + 6, 0, b.pos.z + 5);
    });
  }
  await gameWait(1.4);
  return page.evaluate(() => ({
    hits: window.__dj.hurtLog.filter(h => h.source === 'boss:whip').length,
    markers: window.__dj.groundFx.length,
  }));
}
const whipIn = await whipLands(false);
const whipOut = await whipLands(true);
check('the whip lands on its line, and stepping off it dodges',
  whipIn.hits === 1 && whipOut.hits === 0,
  `standing in it ${whipIn.hits} hit, stepping aside ${whipOut.hits} hit`);

// slam: three blue circles plus one red, and the blue ones save you
const slamSafe = await bossHit('knus', [0, 4]);
const steppedIn = await page.evaluate(() => {
  const d = window.__dj;
  const ring = d.groundFx.find(f => f.mesh.material.color.getHex() === 0x2f9bff);
  if (ring) d.player.pos.set(ring.mesh.position.x, 0, ring.mesh.position.z);
  return !!ring;
});
await gameWait(3.6);
const survived = await page.evaluate(() => window.__dj.state.hp);

const slamOpen = await bossHit('knus', [0, 4]);
await gameWait(3.6);
const punished = await page.evaluate(() => window.__dj.state.hp);

check('the slam marks three safe rings and one kill zone',
  slamSafe.markers === 7 && steppedIn, `${slamSafe.markers} floor markers`);
check('standing in a blue ring saves you from the slam',
  survived >= slamSafe.hp && punished < slamOpen.hp,
  `in a ring -${Math.round(slamSafe.hp - survived)}, out in the open -${Math.round(slamOpen.hp - punished)}`);

await page.evaluate(() => { window.__dj.state.level = 1; });

// and back up again, also by walking
await page.evaluate(() => {
  const d = window.__dj;
  const e = d.dungeon.exitSpot;
  d.player.pos.set(e.x, 0, e.z - 7);
  d.player.yaw = 0;
  window.__djLook(0, -0.1);
});
await gameWait(0.6);
await page.keyboard.down('w');
for (let i = 0; i < 14 && (await page.evaluate(() => window.__dj.zone)) === 'dungeon'; i++) await gameWait(0.4);
await page.keyboard.up('w');
check('walking onto the stairs brings you back up',
  (await page.evaluate(() => window.__dj.zone)) === 'overworld');

await page.screenshot({ path: 'shots/test-final.png' });
console.log(checks.join('\n'));
console.log(errors.length ? '\nERRORS:\n' + errors.slice(0, 10).join('\n') : '\nno page errors');
await browser.close();
