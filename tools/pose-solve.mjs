// Solves the sword mount rotation so the blade points out to the hero's right,
// slightly down and forward — the pose in the concept art.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto('http://127.0.0.1:8099/index.html');
await page.waitForFunction(() => !!window.__dj);
await page.waitForTimeout(800);
const best = await page.evaluate(async () => {
  const d = window.__dj;
  const THREE = await import('/vendor/three.module.js');
  const model = d.player.obj;
  const u = model.userData;
  const mount = u.weaponMount;
  const blade = mount.children[0].children[0]; // blade mesh
  // freeze the idle arm pose the game uses, so the solve matches play
  u.armR.shoulder.rotation.set(0.22, 0, -0.5);
  u.armR.elbow.rotation.set(-0.25, 0, 0);
  const want = new THREE.Vector3(-0.62, -0.38, 0.68).normalize();
  const tip = new THREE.Vector3(), hand = new THREE.Vector3(), dir = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  let best = null;
  for (let x = 0.0; x <= 3.2; x += 0.1) {
    for (let y = -2.0; y <= 2.0; y += 0.1) {
      for (let z = -1.0; z <= 1.0; z += 0.2) {
        mount.rotation.set(x, y, z);
        model.updateMatrixWorld(true);
        blade.getWorldPosition(tip);
        u.armR.hand.getWorldPosition(hand);
        inv.copy(model.matrixWorld).invert();
        dir.copy(tip).sub(hand).applyMatrix4(new THREE.Matrix4().extractRotation(inv)).normalize();
        const score = dir.dot(want);
        if (!best || score > best.score) best = { x, y, z, score, dir: dir.toArray() };
      }
    }
  }
  mount.rotation.set(best.x, best.y, best.z);
  return best;
});
console.log(JSON.stringify(best));
await browser.close();
