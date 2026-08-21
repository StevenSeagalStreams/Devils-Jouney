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
  hotbar: window.__dj.state.hotbar.filter(Boolean).length,
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

// --- taking damage
const hpBefore = await page.evaluate(() => {
  const d = window.__dj;
  d.state.hp = 100;
  d.monster.pos.copy(d.player.pos).z += 1.2;
  d.monster.state = 'chase';
  return d.state.hp;
});
await gameWait(3.0);
const hpAfter = await page.evaluate(() => window.__dj.state.hp);
check('the monster can hurt you', hpAfter < hpBefore, `hp ${hpBefore} -> ${Math.round(hpAfter)}`);

await page.screenshot({ path: 'shots/test-combat.png' });
console.log(checks.join('\n'));
console.log(errors.length ? '\nERRORS:\n' + errors.slice(0, 10).join('\n') : '\nno page errors');
await browser.close();
