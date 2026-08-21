// Headless play-through: swings until the monster dies, checks xp/loot/level,
// then opens the bag. Prints a PASS/FAIL line per check.
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

// --- movement
const before = await page.evaluate(() => ({ ...window.__dj.player.pos }));
await page.keyboard.down('w');
await gameWait(1.0);
await page.keyboard.up('w');
const after = await page.evaluate(() => ({ ...window.__dj.player.pos }));
const moved = Math.hypot(after.x - before.x, after.z - before.z);
check('WASD moves the hero', moved > 1.5, `moved ${moved.toFixed(2)}m`);

// --- strafing must follow the camera, not mirror it
async function strafe(key) {
  const start = await page.evaluate(() => ({ ...window.__dj.player.pos }));
  await page.keyboard.down(key);
  await gameWait(0.8);
  await page.keyboard.up(key);
  await gameWait(0.2);
  return await page.evaluate(s => {
    const d = window.__dj;
    // camera local X is screen-right
    const m = d.camera.matrixWorld.elements;
    const dx = d.player.pos.x - s.x, dz = d.player.pos.z - s.z;
    return +(dx * m[0] + dz * m[2]).toFixed(2);
  }, start);
}
const dRight = await strafe('d');
const aLeft = await strafe('a');
check('D strafes right on screen', dRight > 0.5, `${dRight}m along camera-right`);
check('A strafes left on screen', aLeft < -0.5, `${aLeft}m along camera-right`);

// --- the camera stays a third-person rig at every pitch
const rig = await page.evaluate(async () => {
  const THREE = await import('/vendor/three.module.js');
  const d = window.__dj;
  const out = [];
  for (const pitch of [-0.55, -0.3, -0.1, 0.25]) {
    d.camera.position.set(0, 0, 0);          // force the follow lerp to resettle
    for (let i = 0; i < 200; i++) window.__djCam && window.__djCam(0.1, pitch);
    const head = new THREE.Vector3(d.player.pos.x, d.player.pos.y + 1.5, d.player.pos.z);
    const dist = d.camera.position.distanceTo(head);
    const s = d.screenOf(head);
    out.push({ pitch, dist: +dist.toFixed(2), onScreen: s.visible,
      sx: +(s.x / window.innerWidth).toFixed(2), sy: +(s.y / window.innerHeight).toFixed(2) });
  }
  return out;
});
const framed = rig.every(r => r.dist > 2.5 && r.dist < 7 && r.onScreen
  && r.sx > 0.05 && r.sx < 0.95 && r.sy > 0.05 && r.sy < 0.95);
check('camera stays locked in third person', framed,
  rig.map(r => `p${r.pitch}: ${r.dist}m at ${r.sx}/${r.sy}`).join(', '));

// --- combat until the monster dies
const start = await page.evaluate(() => ({ xp: window.__dj.state.xp, level: window.__dj.state.level, hp: window.__dj.monster.hp }));
let swings = 0;
for (let i = 0; i < 40; i++) {
  const dead = await page.evaluate(() => {
    const d = window.__dj;
    if (d.monster.dead) return true;
    d.monster.pos.set(d.player.pos.x, 0, d.player.pos.z + 1.6);
    d.player.yaw = 0;                       // face the monster
    d.state.stamina = 100;
    d.attack();
    return false;
  });
  if (dead) break;
  swings++;
  await gameWait(0.6);
}
await gameWait(0.2);
const afterKill = await page.evaluate(() => ({
  dropped: window.__dj.lootDropped,
  dead: window.__dj.monster.dead,
  xp: window.__dj.state.xp,
  level: window.__dj.state.level,
  drops: window.__dj.drops.length,
}));
check('left click kills the monster', afterKill.dead, `${swings} swings`);
check('killing grants xp or a level', afterKill.xp > start.xp || afterKill.level > start.level,
  `xp ${start.xp}->${afterKill.xp}, lvl ${start.level}->${afterKill.level}`);
check('monster drops loot', afterKill.dropped > 0, `${afterKill.dropped} dropped`);

// --- walk onto the drop
await page.evaluate(() => {
  const d = window.__dj;
  const drop = d.drops[0];
  if (drop) d.player.pos.set(drop.obj.position.x, 0, drop.obj.position.z);
});
await gameWait(0.5);
const afterPickup = await page.evaluate(() => ({
  drops: window.__dj.drops.length,
  bag: window.__dj.state.bag.length,
  weapon: window.__dj.state.equipped.weapon?.name,
  owned: window.__dj.state.bag.length + Object.values(window.__dj.state.equipped).filter(Boolean).length,
}));
check('walking over loot picks it up', afterPickup.drops === 0 && afterPickup.owned > 1,
  `owns ${afterPickup.owned} items (bag ${afterPickup.bag})`);
check('a weapon stays equipped', !!afterPickup.weapon, afterPickup.weapon);

// --- respawn
await gameWait(4.2);
const resp = await page.evaluate(() => ({ dead: window.__dj.monster.dead, hp: window.__dj.monster.hp }));
check('a new monster spawns', !resp.dead, `hp ${Math.round(resp.hp)}`);

// --- inventory
await page.evaluate(() => window.__dj.give(5));
await page.keyboard.press('i');
await page.waitForTimeout(600);
const invOpen = await page.evaluate(() => !document.getElementById('inventory').classList.contains('hidden'));
check('I opens the bag', invOpen);
await page.screenshot({ path: 'shots/test-inventory.png' });
await page.keyboard.press('i');
await page.waitForTimeout(400);

// --- turning must take the short way round the compass
const turn = await page.evaluate(async () => {
  const d = window.__dj;
  d.player.pos.set(0, 0, 0);
  d.player.yaw = 3.10;                 // facing just short of +pi
  window.__djLook(0, -0.1);            // camera forward = +z, so W targets yaw 0...
  // ...instead aim for -3.10: press S, whose target is atan2(0,-1) = pi, wrapping side
  const samples = [];
  window.__djKeys.add('s');
  for (let i = 0; i < 40; i++) {
    window.__djStep(0.03);
    samples.push(Math.cos(d.player.yaw));
  }
  window.__djKeys.delete('s');
  return { maxCos: Math.max(...samples), finalYaw: +d.player.yaw.toFixed(2) };
});
check('the hero turns the short way, not full circle', turn.maxCos < 0.2,
  `front-facing peak cos=${turn.maxCos.toFixed(2)} (1.0 would mean she spun through forward)`);

// --- abilities
const abil = await page.evaluate(() => {
  const d = window.__dj;
  const out = {};
  out.count = d.abilities.length;
  out.locked = d.useAbility(7);                    // Dommedag needs level 15
  d.state.level = 20;                              // unlock everything
  d.state.hp = 50; d.state.stamina = 200;
  d.monster.pos.copy(d.player.pos); d.monster.pos.z += 2.0;
  d.monster.hp = d.monster.maxHp;
  d.player.yaw = 0;                                // face it: Hug only hits in front

  const hpBefore = d.monster.hp;
  out.used = d.useAbility(0);                      // Hug
  out.damaged = hpBefore - d.monster.hp;
  out.onCooldown = d.state.cooldowns.hug > 0;
  out.blockedWhileCooling = d.useAbility(0) === false;

  const healBefore = d.state.hp;
  d.useAbility(3);                                 // Forbinding
  out.healed = d.state.hp - healBefore;

  d.useAbility(4);                                 // Stenhud
  out.shield = d.state.buffs.shield > 0;
  const dmgBefore = d.totals().damage;
  d.useAbility(6);                                 // Kampraseri
  out.rage = d.totals().damage > dmgBefore;
  return out;
});
check('there are eight abilities', abil.count === 8, `${abil.count}`);
check('locked abilities cannot be used', abil.locked === false);
check('an ability damages the monster', abil.used && abil.damaged > 0, `-${abil.damaged} hp`);
check('using one starts its cooldown', abil.onCooldown && abil.blockedWhileCooling);
check('the heal ability restores life', abil.healed > 0, `+${abil.healed} hp`);
check('the shield and rage buffs apply', abil.shield && abil.rage);

// abilities must get bigger as you level
const scaling = await page.evaluate(async () => {
  const { abilityPower } = await import('/src/abilities.js');
  const d = window.__dj;
  const a = d.abilities[0];
  const at = lvl => { d.state.level = lvl; return abilityPower(a, lvl, d.totals()); };
  return { low: at(1), high: at(20) };
});
check('abilities scale up with level', scaling.high > scaling.low * 2,
  `Hug hits for ${scaling.low} at level 1 and ${scaling.high} at level 20`);

await page.evaluate(() => {
  const d = window.__dj;
  d.state.level = 1; d.state.cooldowns = {}; d.state.buffs.shield = 0; d.state.buffs.rage = 0;
  d.monster.hp = d.monster.maxHp;
});

// --- loot must be reachable wherever it lands, including on high ground
const hilly = await page.evaluate(() => {
  const d = window.__dj;
  // drop an item where the terrain is well above the origin plane
  let spot = null;
  for (let r = 20; r < 90 && !spot; r += 5) {
    for (let a = 0; a < 6.28; a += 0.4) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(window.__djHeightAt(x, z)) > 2.5) { spot = { x, z }; break; }
    }
  }
  if (!spot) return { skipped: true };
  const before = d.state.bag.length + Object.values(d.state.equipped).filter(Boolean).length;
  d.dropAt(spot.x, spot.z);
  d.player.pos.set(spot.x, 0, spot.z);
  return { spot, before, terrain: +window.__djHeightAt(spot.x, spot.z).toFixed(2) };
});
await gameWait(0.5);
const hillyAfter = await page.evaluate(() => ({
  drops: window.__dj.drops.length,
  owned: window.__dj.state.bag.length + Object.values(window.__dj.state.equipped).filter(Boolean).length,
}));
check('loot on high ground can be picked up', !hilly.skipped && hillyAfter.drops === 0,
  hilly.skipped ? 'no sloped spot found' : `terrain y=${hilly.terrain}, ${hillyAfter.drops} left on the ground`);

// --- the two attacks: different timing, different damage, and dodgeable
const timings = await page.evaluate(() => {
  const a = window.__dj.attacks;
  return { light: a.light.hit, heavy: a.heavy.hit, lightDmg: a.light.dmg, heavyDmg: a.heavy.dmg };
});
check('the heavy attack telegraphs for longer', timings.heavy >= timings.light * 1.8,
  `light ${timings.light}s vs heavy ${timings.heavy}s`);
check('the heavy attack hurts more', timings.heavyDmg >= timings.lightDmg * 2.5,
  `x${timings.lightDmg} vs x${timings.heavyDmg}`);

async function tryAttack(kind, dodge) {
  await page.evaluate(k => {
    const d = window.__dj;
    d.state.hp = 100;
    d.monster.pos.copy(d.player.pos); d.monster.pos.z += 2.0;
    d.monster.yaw = Math.atan2(d.player.pos.x - d.monster.pos.x, d.player.pos.z - d.monster.pos.z);
    d.forceAttack(k);
  }, kind);
  if (dodge) {
    await gameWait(0.1);
    await page.evaluate(() => { window.__dj.player.pos.z -= 6; });   // step out of reach
  }
  // read the damage from this one blow: waiting longer lets the quick attack
  // land a second time and skews the comparison
  await page.waitForFunction(() => window.__dj.monster.atk?.hasHit, null, { timeout: 90000 });
  await gameWait(0.05);
  return await page.evaluate(() => {
    const d = window.__dj;
    d.monster.cooldown = 99;          // stop it chaining into the next reading
    return 100 - d.state.hp;
  });
}
const heavyHit = await tryAttack('heavy', false);
const heavyDodged = await tryAttack('heavy', true);
const lightHit = await tryAttack('light', false);
check('a landed heavy attack hurts', heavyHit > 5, `-${heavyHit.toFixed(0)} hp`);
check('stepping out of a wind-up avoids it', heavyDodged < 1, `-${heavyDodged.toFixed(0)} hp`);
check('the heavy hits harder than the light', heavyHit > lightHit * 2,
  `heavy -${heavyHit.toFixed(0)} vs light -${lightHit.toFixed(0)}`);

// --- the town is a safe zone with two working shops
const townChecks = await page.evaluate(async () => {
  const d = window.__dj;
  const out = {};
  out.titleGone = !document.querySelector('.title-plate');

  // stand in the middle of town and let the monster swing at you
  d.player.pos.set(d.town.x, 0, d.town.z);
  d.state.hp = 100;
  d.monster.pos.set(d.town.x, 0, d.town.z + 1.5);
  d.forceAttack('heavy');
  return out;
});
await gameWait(2.0);
const safe = await page.evaluate(() => {
  const d = window.__dj;
  return {
    hp: d.state.hp,
    monsterDist: +Math.hypot(d.monster.pos.x - d.town.x, d.monster.pos.z - d.town.z).toFixed(1),
    radius: d.town.radius,
  };
});
check('the game title is gone from the HUD', townChecks.titleGone);
check('the town is a safe zone', safe.hp >= 100, `hp ${Math.round(safe.hp)}`);
check('monsters are pushed out of the town', safe.monsterDist > safe.radius,
  `${safe.monsterDist}m from the centre, fence at ${safe.radius}m`);

// healer
const heal = await page.evaluate(() => {
  const d = window.__dj;
  d.state.hp = 40;
  d.state.gold = 200;
  const cost = d.game.healCost();
  d.game.buyHeal();
  return { cost, hp: Math.round(d.state.hp), max: d.totals().maxHp, gold: d.state.gold };
});
check('the healer restores life for gold', heal.hp === heal.max && heal.gold === 200 - heal.cost,
  `${heal.cost} guld -> ${heal.hp}/${heal.max}, ${heal.gold} left`);

// merchant
const trade = await page.evaluate(() => {
  const d = window.__dj;
  d.state.gold = 500;
  d.game.restock();
  const item = d.game.stock[0];
  const price = d.game.buyPrice(item);
  d.game.buyItem(item);
  const afterBuy = { gold: d.state.gold, owns: d.state.bag.includes(item) };
  const back = d.game.sellPrice(item);
  d.game.sellItem(item);
  return { price, back, afterBuy, gold: d.state.gold, stillOwns: d.state.bag.includes(item) };
});
check('you can buy from the merchant', trade.afterBuy.owns && trade.afterBuy.gold === 500 - trade.price,
  `paid ${trade.price}`);
check('you can sell to the merchant', !trade.stillOwns && trade.gold === 500 - trade.price + trade.back,
  `got ${trade.back} back`);

// leave town again so the remaining checks fight normally
await page.evaluate(() => { window.__dj.player.pos.set(0, 0, 0); window.__dj.monster.cooldown = 0; });
await gameWait(0.3);

// --- taking damage
const hpBefore = await page.evaluate(() => {
  const d = window.__dj;
  d.state.hp = 100;
  d.monster.pos.copy(d.player.pos).z += 1.2;
  d.monster.state = 'chase';
  d.monster.cooldown = 0;      // the attack readings above park it on a long cooldown
  return d.state.hp;
});
await gameWait(4.0);
const hpAfter = await page.evaluate(() => window.__dj.state.hp);
check('the monster can hurt you', hpAfter < hpBefore, `hp ${hpBefore} -> ${Math.round(hpAfter)}`);

await page.screenshot({ path: 'shots/test-combat.png' });
console.log(checks.join('\n'));
console.log(errors.length ? '\nERRORS:\n' + errors.slice(0, 10).join('\n') : '\nno page errors');
await browser.close();
