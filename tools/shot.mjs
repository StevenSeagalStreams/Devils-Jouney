// Screenshot helper: node tools/shot.mjs <out.png> [scriptName]
// Boots the game in headless Chromium (SwiftShader), runs an optional scripted
// scenario, then writes a PNG so the look can be reviewed without a GPU.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const out = process.argv[2] || 'shots/frame.png';
const scenario = process.argv[3] || 'start';
const url = process.env.GAME_URL || 'http://127.0.0.1:8099/index.html';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars'],
});
const W = Number(process.env.SHOT_W || 1536);
const H = Number(process.env.SHOT_H || 1024);
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__dj, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);

async function play() {
  await page.click('#play');
  await page.waitForTimeout(600);
}

if (scenario !== 'menu') {
  await play();
  // pointer lock is unavailable headless; drive the state directly instead
  await page.evaluate(() => { window.__dj.state.running = true; });
}

if (scenario === 'combat') {
  await page.evaluate(() => {
    const d = window.__dj;
    d.monster.pos.set(d.player.pos.x, 0, d.player.pos.z - 2.4);
    d.monster.state = 'chase';
  });
  await page.waitForTimeout(400);
  await page.mouse.click(760, 500);
  await page.waitForTimeout(220);
}
if (scenario === 'inventory') {
  await page.evaluate(() => window.__dj.give(6));
  await page.keyboard.press('i');
  await page.waitForTimeout(500);
}
if (scenario.startsWith('closeup')) {
  const ang = Number(scenario.split(':')[1] ?? 180);
  await page.evaluate(a => {
    window.__djFreeCam = true;
    const d = window.__dj;
    const r = 4.2, rad = a * Math.PI / 180;
    d.camera.position.set(d.player.pos.x + Math.sin(rad) * r, 1.6, d.player.pos.z + Math.cos(rad) * r);
    d.camera.lookAt(d.player.pos.x, 1.0, d.player.pos.z);
  }, ang);
  await page.waitForTimeout(300);
}
if (scenario.startsWith('walkclose')) {
  // hold W, then freeze the camera beside the hero to catch a mid-stride frame
  const ang = Number(scenario.split(':')[1] ?? 90);
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.evaluate(a => {
    window.__djFreeCam = true;
    const d = window.__dj;
    const r = 3.6, rad = a * Math.PI / 180;
    d.camera.position.set(d.player.pos.x + Math.sin(rad) * r, 1.5, d.player.pos.z + Math.cos(rad) * r);
    d.camera.lookAt(d.player.pos.x, 0.95, d.player.pos.z);
  }, ang);
  await page.waitForTimeout(90);
  await page.screenshot({ path: out });
  await page.keyboard.up('w');
  await browser.close();
  process.exit(0);
}
if (scenario === 'walk') {
  await page.keyboard.down('w');
  await page.waitForTimeout(1400);
  await page.keyboard.up('w');
}

await page.waitForTimeout(500);
await page.screenshot({ path: out });
console.log(errors.length ? errors.slice(0, 12).join('\n') : 'no console errors');
await browser.close();
