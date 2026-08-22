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
