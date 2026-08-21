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

/* ------------------------------ abilities ------------------------------ */
const abil = await page.evaluate(() => {
  const d = window.__dj;
  const out = { count: d.abilities.length };
  out.locked = d.useAbility(7);
  d.state.level = 20; d.state.hp = 50; d.state.stamina = 200;
  const m = d.monsters[0];
  d.player.pos.set(m.pos.x, 0, m.pos.z - 2.0);
  d.player.yaw = 0;                                // facing +z, toward the creature
  const hpBefore = m.hp;
  out.used = d.useAbility(0);
  out.damaged = hpBefore - m.hp;
  out.onCooldown = d.state.cooldowns.hug > 0;
  out.blocked = d.useAbility(0) === false;
  const healBefore = d.state.hp;
  d.useAbility(3);
  out.healed = d.state.hp - healBefore;
  d.useAbility(4); out.shield = d.state.buffs.shield > 0;
  const dmgBefore = d.totals().damage;
  d.useAbility(6); out.rage = d.totals().damage > dmgBefore;
  d.state.level = 1; d.state.cooldowns = {}; d.state.buffs.shield = 0; d.state.buffs.rage = 0;
  return out;
});
check('there are eight abilities', abil.count === 8);
check('locked abilities cannot be used', abil.locked === false);
check('an ability damages a creature', abil.used && abil.damaged > 0, `-${abil.damaged} hp`);
check('using one starts its cooldown', abil.onCooldown && abil.blocked);
check('the heal ability restores life', abil.healed > 0, `+${abil.healed} hp`);
check('the shield and rage buffs apply', abil.shield && abil.rage);

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
  d.state.level = 1;
  return { front, back };
});
check('the guard blocks what it faces', block.back > block.front * 2,
  `front ${block.front} vs back ${block.back}`);

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
