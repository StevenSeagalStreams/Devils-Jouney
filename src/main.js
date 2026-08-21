import * as THREE from 'three';
import { createWorld, heightAt } from './world.js';
import { createPlayerModel, createMonsterModel, createWeaponMesh } from './characters.js';
import { makeItem, itemScore, RARITIES } from './items.js';
import { UI } from './ui.js';

/* =================================================================== *
 *  Devil's Journey — single-monster demo
 *  WASD to move · mouse to look · left click to swing · I for the bag
 * =================================================================== */

const clock = new THREE.Clock();
let gameTime = 0;
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 1200);
const world = createWorld(scene);

/* --------------------------- state --------------------------- */
const state = {
  level: 1,
  xp: 0,
  hp: 100,
  stamina: 100,
  bag: [],
  hotbar: [],
  equipped: { weapon: null, armor: null, trinket: null },
  running: false,
  dead: false,
};

const BASE = { hp: 100, damage: 6, stamina: 100, speed: 4.2 };
const xpForLevel = lvl => 40 + (lvl - 1) * 32;

function totals() {
  let liv = 0, skade = 0, smidighed = 0, styrke = 0, tier = 0;
  for (const item of Object.values(state.equipped)) {
    if (!item) continue;
    liv += item.stats.liv || 0;
    skade += item.stats.skade || 0;
    smidighed += item.stats.smidighed || 0;
    styrke += item.stats.styrke || 0;
    if (item.slot === 'weapon') tier = item.tier;
  }
  const lvl = state.level;
  return {
    maxHp: BASE.hp + liv + (lvl - 1) * 12,
    damage: BASE.damage + skade + Math.floor(styrke * 0.6) + (lvl - 1) * 2,
    smidighed, styrke, liv, tier,
    maxStamina: BASE.stamina + smidighed * 1.5,
    speed: BASE.speed + smidighed * 0.03,
    attackSpeed: 1 + smidighed * 0.008,
  };
}

/* --------------------------- player --------------------------- */
const player = {
  obj: createPlayerModel(),
  pos: new THREE.Vector3(0, 0, 6),
  yaw: Math.PI,
  vel: new THREE.Vector3(),
  walkPhase: 0,
  attackTime: -1,
  attackDur: 0.52,
  hasHit: false,
  hurtFlash: 0,
};
scene.add(player.obj);

/* --------------------------- monster --------------------------- */
/* Two attacks with readable tells. `hit` is when the damage lands, so the whole
   windup is reaction time; `track` is how fast it may keep re-aiming at you
   while winding up — the heavy commits and can be side-stepped. */
const ATTACKS = {
  light: { kind: 'light', hit: 0.62, recover: 0.45, range: 2.7, dmg: 0.7, cooldown: 0.8, track: 2.6, tell: '#ffb02e' },
  heavy: { kind: 'heavy', hit: 1.25, recover: 0.9, range: 3.4, dmg: 2.4, cooldown: 1.6, track: 0, tell: '#ff3b1f' },
};

// one shared ground ring: it grows to the attack's reach exactly as the blow lands
const telegraph = new THREE.Mesh(
  new THREE.RingGeometry(0.82, 1.0, 40),
  new THREE.MeshBasicMaterial({ color: '#ff5a3c', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
telegraph.rotation.x = -Math.PI / 2;
telegraph.visible = false;
telegraph.renderOrder = 2;
scene.add(telegraph);

function startAttack(m, kind) {
  const a = ATTACKS[kind];
  m.atk = { ...a, t: 0, hasHit: false };
  m.state = 'attack';
  m.stateT = 0;
  m.lastHeavy = kind === 'heavy';
}

function updateTelegraph(m) {
  const a = m.state === 'attack' ? m.atk : null;
  if (!a || a.hasHit) { telegraph.visible = false; return; }
  const p = THREE.MathUtils.clamp(a.t / a.hit, 0, 1);
  telegraph.visible = true;
  telegraph.position.set(m.pos.x, heightAt(m.pos.x, m.pos.z) + 0.06, m.pos.z);
  const s = (a.range * p) / 1.0;
  telegraph.scale.setScalar(Math.max(0.05, s));
  telegraph.material.color.set(a.tell);
  telegraph.material.opacity = 0.25 + 0.6 * p;
}
let monsterSeq = 0;
function spawnMonster(level) {
  const m = {
    id: ++monsterSeq,
    obj: createMonsterModel((level - 1) % 3),
    pos: new THREE.Vector3(0, 0, -8),
    yaw: 0,
    level,
    maxHp: 34 + (level - 1) * 16,
    hp: 34 + (level - 1) * 16,
    damage: 6 + (level - 1) * 2.5,
    speed: 2.5,
    state: 'idle',
    stateT: 0,
    atk: null,
    cooldown: 0,
    lastHeavy: false,
    hurt: 0,
    walkPhase: 0,
    wander: new THREE.Vector3(),
    dead: false,
    name: `Skovtrold ${level}`,
  };
  if (monsterSeq === 1) {
    m.pos.set(0, 0, -11);
  } else {
    const a = Math.random() * Math.PI * 2;
    const r = 11 + Math.random() * 7;
    m.pos.set(player.pos.x + Math.cos(a) * r, 0, player.pos.z + Math.sin(a) * r);
  }
  m.obj.position.copy(m.pos);
  m.obj.scale.setScalar(0.88 + Math.min(level, 8) * 0.03);
  scene.add(m.obj);
  return m;
}
let monster = spawnMonster(1);
let respawnT = -1;

/* --------------------------- loot on the ground --------------------------- */
const drops = [];
let lootDropped = 0;
function dropLoot(item, pos) {
  lootDropped++;
  const g = new THREE.Group();
  const mesh = item.type === 'weapon'
    ? createWeaponMesh(item.tier)
    : new THREE.Mesh(
      item.type === 'armor' ? new THREE.BoxGeometry(0.5, 0.55, 0.3) : new THREE.OctahedronGeometry(0.28),
      new THREE.MeshLambertMaterial({ color: item.color, flatShading: true }));
  mesh.scale.setScalar(item.type === 'weapon' ? 0.55 : 1);
  g.add(mesh);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.3, 3.2, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 1.6;
  g.add(beam);
  g.position.set(pos.x, heightAt(pos.x, pos.z) + 0.7, pos.z);
  scene.add(g);
  drops.push({ item, obj: g, t: 0 });
}

/* --------------------------- input --------------------------- */
const keys = new Set();

let wantAttack = false;
const look = { yaw: Math.PI, pitch: -0.10 };

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'i' || k === 'tab') { e.preventDefault(); toggleBag(); return; }
  if (k === 'escape') { pause(); return; }
  if (k >= '1' && k <= '7') {
    const item = state.hotbar[+k - 1];
    if (item) equip(item);
    return;
  }
  keys.add(k);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

canvas.addEventListener('mousedown', e => {
  if (e.button === 0) {
    if (!state.running) return;
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
    wantAttack = true;
  }
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  look.yaw -= e.movementX * 0.0025;
  look.pitch = THREE.MathUtils.clamp(look.pitch - e.movementY * 0.002, -0.55, 0.25);
});
// Only pause when a lock we actually held goes away — some browsers (and
// headless runs) simply deny the request, and that must not stop the game.
let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && hadLock && state.running && !ui.inventoryOpen) pause();
  hadLock = locked;
});

// Fallback look control when pointer lock is unavailable: drag with the right
// mouse button (left stays free for attacking).
let dragging = false;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => { if (e.button === 2) dragging = true; });
addEventListener('mouseup', e => { if (e.button === 2) dragging = false; });
addEventListener('mousemove', e => {
  if (!dragging || document.pointerLockElement === canvas) return;
  look.yaw -= e.movementX * 0.004;
  look.pitch = THREE.MathUtils.clamp(look.pitch - e.movementY * 0.003, -0.55, 0.25);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);

/* --------------------------- game api for UI --------------------------- */
const game = {
  state,
  totals,
  /** Taking off +liv gear can leave hp above the new max until the next frame. */
  clampVitals() {
    const t = totals();
    state.hp = Math.min(state.hp, t.maxHp);
    state.stamina = Math.min(state.stamina, t.maxStamina);
  },
  equip(item) {
    const prev = state.equipped[item.slot];
    const i = state.bag.indexOf(item);
    if (i >= 0) state.bag.splice(i, 1);
    state.equipped[item.slot] = item;
    if (prev) state.bag.unshift(prev);
    if (item.slot === 'weapon') player.obj.userData.setWeaponTier(item.tier);
    this.clampVitals();
    syncHotbar();
    ui.renderAll();
    ui.toast(`Tog ${item.name} på`, 1200);
  },
  unequip(slot) {
    const item = state.equipped[slot];
    if (!item) return;
    state.equipped[slot] = null;
    state.bag.unshift(item);
    if (slot === 'weapon') player.obj.userData.setWeaponTier(0);
    this.clampVitals();
    syncHotbar();
    ui.renderAll();
  },
  dropItem(item) {
    const i = state.bag.indexOf(item);
    if (i < 0) return;
    state.bag.splice(i, 1);
    syncHotbar();
    ui.renderAll();
    ui.toast(`Smed ${item.name} væk`, 1100);
  },
};

const ui = new UI(game);

function syncHotbar() {
  state.hotbar = state.bag.slice(0, 7);
}

/* --------------------------- combat helpers --------------------------- */
const tmpV = new THREE.Vector3();
const tmpFoot = new THREE.Vector3();
const tmpFacing = new THREE.Vector3();

/** Rigid legs shorten as they swing, so pin the lowest foot to the terrain and
 *  let the pelvis height fall out of that — no hand-tuned bob to get wrong. */
function plantFeet(obj, pelvis, base, feet) {
  pelvis.position.y = base;
  obj.updateMatrixWorld(true);
  const scale = obj.scale.y || 1;
  let lowest = Infinity;
  for (const { mesh, half } of feet) {
    mesh.getWorldPosition(tmpFoot);
    lowest = Math.min(lowest, tmpFoot.y - half * scale);
  }
  if (!Number.isFinite(lowest)) return;
  pelvis.position.y = base + (obj.position.y - lowest) / scale;
}
// its own scratch vector: callers hold live references to tmpV across a call
const tmpProj = new THREE.Vector3();
function screenOf(v3, yOffset = 0) {
  tmpProj.copy(v3);
  tmpProj.y += yOffset;
  tmpProj.project(camera);
  return {
    x: (tmpProj.x * 0.5 + 0.5) * innerWidth,
    y: (-tmpProj.y * 0.5 + 0.5) * innerHeight,
    visible: tmpProj.z < 1 && Math.abs(tmpProj.x) <= 1 && Math.abs(tmpProj.y) <= 1,
  };
}

function gainXp(amount) {
  state.xp += amount;
  let leveled = false;
  while (state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level);
    state.level++;
    leveled = true;
  }
  if (leveled) {
    state.hp = totals().maxHp;
    state.stamina = totals().maxStamina;
    ui.toast(`Niveau ${state.level}!`, 1800);
    ui.floatText(`Niveau ${state.level}`, screenOf(player.pos, 2.4), 'xp');
    ui.renderStats();
  }
}

function damageMonster(amount, crit) {
  monster.hp -= amount;
  monster.hurt = 0.18;
  ui.floatText(`${amount}`, screenOf(monster.pos, 1.75), crit ? 'crit' : 'dmg');
  if (monster.hp <= 0) killMonster();
}

function killMonster() {
  monster.dead = true;
  monster.state = 'dead';
  monster.stateT = 0;
  const xp = 18 + monster.level * 8;
  gainXp(xp);
  ui.floatText(`+${xp} xp`, screenOf(monster.pos, 2.0), 'xp');
  ui.removeEnemyBar(monster.id);

  // loot: always something small, sometimes a real upgrade
  const roll = Math.random();
  const type = roll < 0.55 ? 'weapon' : roll < 0.85 ? 'armor' : 'trinket';
  const item = makeItem(type, Math.max(1, state.level), Math.random);
  dropLoot(item, monster.pos);
  respawnT = 3.5;
}

function playerAttack(dt) {
  const t = totals();
  if (wantAttack && player.attackTime < 0 && state.stamina >= 12) {
    player.attackTime = 0;
    player.attackDur = 0.52 / t.attackSpeed;
    player.hasHit = false;
    state.stamina -= 12;
  }
  wantAttack = false;
  if (player.attackTime < 0) return;

  player.attackTime += dt;
  const p = player.attackTime / player.attackDur;

  if (!player.hasHit && p > 0.34) {
    player.hasHit = true;
    if (!monster.dead) {
      const to = tmpV.copy(monster.pos).sub(player.pos);
      const dist = to.length();
      const facing = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      const dot = to.normalize().dot(facing);
      if (dist < 3.0 && dot > 0.35) {
        const crit = Math.random() < 0.12 + t.smidighed * 0.004;
        const raw = t.damage * (0.9 + Math.random() * 0.2) * (crit ? 1.8 : 1);
        damageMonster(Math.max(1, Math.round(raw)), crit);
      } else {
        ui.floatText('svup!', screenOf(player.pos, 2.0), 'dmg');
      }
    }
  }
  if (player.attackTime > player.attackDur) player.attackTime = -1;
}

function hurtPlayer(amount) {
  state.hp -= amount;
  player.hurtFlash = 0.25;
  ui.flashDamage();
  ui.floatText(`-${Math.round(amount)}`, screenOf(player.pos, 2.2), 'hurt');
  if (state.hp <= 0 && !state.dead) die();
}

function die() {
  state.dead = true;
  state.running = false;
  document.exitPointerLock?.();
  document.getElementById('death').classList.remove('hidden');
}

/* --------------------------- monster AI --------------------------- */
function updateMonster(dt) {
  const m = monster;
  m.stateT += dt;
  m.hurt = Math.max(0, m.hurt - dt);
  m.cooldown = Math.max(0, m.cooldown - dt);

  if (m.state === 'dead') {
    m.obj.rotation.x = THREE.MathUtils.lerp(m.obj.rotation.x, -Math.PI / 2.2, dt * 6);
    m.obj.position.y = THREE.MathUtils.lerp(m.obj.position.y, heightAt(m.pos.x, m.pos.z) - 0.3, dt * 4);
    telegraph.visible = false;
    if (respawnT > 0) {
      respawnT -= dt;
      if (respawnT <= 0) {
        scene.remove(m.obj);
        monster = spawnMonster(Math.max(1, state.level));
        respawnT = -1;
        ui.toast('Et nyt monster dukker op', 1400);
      }
    }
    return;
  }

  const toPlayer = tmpV.copy(player.pos).sub(m.pos);
  const dist = toPlayer.length();
  toPlayer.normalize();

  if (m.state === 'idle') {
    if (m.stateT > 2.5) {
      m.stateT = 0;
      const a = Math.random() * Math.PI * 2;
      m.wander.set(Math.cos(a), 0, Math.sin(a));
    }
    // gentle drift so it never looks frozen
    const step = m.wander.clone().multiplyScalar(0.7 * dt);
    m.pos.add(step);
    if (step.lengthSq() > 1e-6) m.yaw = Math.atan2(step.x, step.z);
    m.walkPhase += dt * 3;
    if (dist < 12) { m.state = 'chase'; m.stateT = 0; }
  } else if (m.state === 'chase') {
    m.yaw = THREE.MathUtils.lerp(m.yaw, Math.atan2(toPlayer.x, toPlayer.z), Math.min(1, dt * 6));
    if (m.cooldown > 0 && dist < 2.4) {
      // give ground after swinging, so the fight has a rhythm
      m.pos.addScaledVector(toPlayer, -m.speed * 0.55 * dt);
      m.walkPhase += dt * 5;
    } else if (dist > 1.9) {
      m.pos.addScaledVector(toPlayer, m.speed * dt);
      m.walkPhase += dt * 8;
    }
    if (dist < 2.3 && m.cooldown <= 0) {
      startAttack(m, !m.lastHeavy && Math.random() < 0.4 ? 'heavy' : 'light');
    }
    if (dist > 20) { m.state = 'idle'; m.stateT = 0; }
  } else if (m.state === 'attack') {
    const a = m.atk;
    a.t += dt;
    // the heavy commits once it starts; the light still tracks you, but slowly
    if (a.track > 0 && !a.hasHit) {
      m.yaw = THREE.MathUtils.lerp(m.yaw, Math.atan2(toPlayer.x, toPlayer.z), Math.min(1, dt * a.track));
    }
    if (!a.hasHit && a.t >= a.hit) {
      a.hasHit = true;
      const facing = tmpFacing.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
      if (dist < a.range && toPlayer.dot(facing) > 0.25) {
        hurtPlayer(m.damage * a.dmg * (0.9 + Math.random() * 0.2));
      } else {
        ui.floatText('forbi!', screenOf(m.pos, 1.9), 'loot');
      }
    }
    // the tail of the swing is a punish window: it cannot move or turn
    if (a.t >= a.hit + a.recover) {
      m.state = dist < 14 ? 'chase' : 'idle';
      m.stateT = 0;
      m.cooldown = a.cooldown;
    }
  }

  // never let it stand inside the player
  const sep = tmpV.copy(m.pos).sub(player.pos);
  const sepD = sep.length();
  if (sepD < 1.5 && sepD > 0.001) m.pos.copy(player.pos).addScaledVector(sep.normalize(), 1.5);

  // keep it inside the arena
  const lim = 70;
  m.pos.x = THREE.MathUtils.clamp(m.pos.x, -lim, lim);
  m.pos.z = THREE.MathUtils.clamp(m.pos.z, -lim, lim);
  m.obj.position.set(m.pos.x, heightAt(m.pos.x, m.pos.z), m.pos.z);
  m.obj.rotation.y = m.yaw;
  updateTelegraph(m);
  animateMonster(m, dt);
}

function animateMonster(m, dt) {
  const u = m.obj.userData;
  const swing = Math.sin(m.walkPhase) * (m.state === 'chase' ? 0.55 : 0.2);
  u.legR.hip.rotation.x = swing;
  u.legL.hip.rotation.x = -swing;
  u.legR.knee.rotation.x = Math.max(0, -swing) * 0.6;
  u.legL.knee.rotation.x = Math.max(0, swing) * 0.6;
  plantFeet(m.obj, u.body, 0.98, [
    { mesh: u.legR.foot, half: u.legR.footHalf },
    { mesh: u.legL.foot, half: u.legL.footHalf },
  ]);
  u.headPivot.rotation.x = -0.22 + Math.sin(m.walkPhase * 0.5) * 0.05;

  if (m.state === 'attack' && m.atk) {
    const a = m.atk;
    const p = THREE.MathUtils.clamp(a.t / a.hit, 0, 1);
    const post = THREE.MathUtils.clamp((a.t - a.hit) / a.recover, 0, 1);
    const ease = post * post * (3 - 2 * post);
    const idle = Math.sin(m.walkPhase * 0.9) * 0.25;
    const L = THREE.MathUtils.lerp;
    if (a.kind === 'heavy') {
      // both arms haul up overhead, body rears back, then a committed slam
      const raise = Math.sin(p * Math.PI * 0.5) * 2.6;
      u.armR.shoulder.rotation.x = L(-raise + ease * 3.2, idle, ease * 0.7);
      u.armL.shoulder.rotation.x = L(-raise + ease * 3.2, -idle, ease * 0.7);
      u.lean.rotation.x = 0.3 - 0.28 * p + 0.5 * ease;
    } else {
      // a short cocked jab with the one arm
      const cock = Math.sin(p * Math.PI * 0.5) * 1.4;
      u.armR.shoulder.rotation.x = L(-cock + ease * 2.3, idle, ease * 0.75);
      u.armL.shoulder.rotation.x = L(cock * 0.25, -idle, ease * 0.75);
      u.lean.rotation.x = 0.3 + 0.12 * p;
    }
  } else {
    u.lean.rotation.x = THREE.MathUtils.lerp(u.lean.rotation.x, 0.3, dt * 6);
    const idle = Math.sin(m.walkPhase * 0.9) * 0.25;
    u.armR.shoulder.rotation.x = THREE.MathUtils.lerp(u.armR.shoulder.rotation.x, idle, dt * 6);
    u.armL.shoulder.rotation.x = THREE.MathUtils.lerp(u.armL.shoulder.rotation.x, -idle, dt * 6);
  }
  // hit flash wins; otherwise the body glows while a blow is winding up
  const hurt = m.hurt > 0;
  let r = 0, g = 0, bl = 0;
  if (hurt) { r = 0.45; g = 0.1; bl = 0.1; }
  else if (m.state === 'attack' && m.atk && !m.atk.hasHit) {
    const charge = THREE.MathUtils.clamp(m.atk.t / m.atk.hit, 0, 1);
    const heavy = m.atk.kind === 'heavy';
    r = charge * (heavy ? 0.45 : 0.24);
    g = charge * (heavy ? 0.06 : 0.16);
  }
  m.obj.traverse(o => {
    if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setRGB(r, g, bl);
  });
}

/* --------------------------- player update --------------------------- */
function updatePlayer(dt) {
  const t = totals();
  const forward = new THREE.Vector3(Math.sin(look.yaw), 0, Math.cos(look.yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const move = new THREE.Vector3();
  if (keys.has('w')) move.add(forward);
  if (keys.has('s')) move.sub(forward);
  if (keys.has('a')) move.sub(right);
  if (keys.has('d')) move.add(right);

  const sprinting = keys.has('shift') && move.lengthSq() > 0 && state.stamina > 1;
  let speed = t.speed * (sprinting ? 1.55 : 1) * (player.attackTime >= 0 ? 0.45 : 1);
  if (move.lengthSq() > 0) {
    move.normalize();
    player.pos.addScaledVector(move, speed * dt);
    player.yaw = THREE.MathUtils.lerp(
      player.yaw,
      Math.atan2(move.x, move.z),
      1 - Math.pow(0.0001, dt));
    player.walkPhase += dt * (sprinting ? 12 : 8);
  } else {
    player.walkPhase += dt * 1.6;
  }

  // stamina
  state.stamina = THREE.MathUtils.clamp(
    state.stamina + (sprinting ? -18 : 14) * dt, 0, t.maxStamina);
  if (sprinting) state.stamina = Math.max(0, state.stamina);

  // slow health regen out of combat
  if (monster.dead || player.pos.distanceTo(monster.pos) > 14) {
    state.hp = Math.min(t.maxHp, state.hp + 3.5 * dt);
  }

  const lim = 90;
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -lim, lim);
  player.pos.z = THREE.MathUtils.clamp(player.pos.z, -lim, lim);
  player.obj.position.set(player.pos.x, heightAt(player.pos.x, player.pos.z), player.pos.z);
  player.obj.rotation.y = player.yaw;
  player.hurtFlash = Math.max(0, player.hurtFlash - dt);
  animatePlayer(dt, move.lengthSq() > 0, sprinting);
}

function animatePlayer(dt, moving, sprinting) {
  const u = player.obj.userData;
  const amp = moving ? (sprinting ? 0.7 : 0.45) : 0.06;
  const swing = Math.sin(player.walkPhase) * amp;
  u.legR.hip.rotation.x = swing;
  u.legL.hip.rotation.x = -swing;
  u.legR.knee.rotation.x = Math.max(0, -swing) * 0.9;
  u.legL.knee.rotation.x = Math.max(0, swing) * 0.9;
  const breathe = moving ? 0 : Math.sin(player.walkPhase * 0.8) * 0.012;
  u.torso.rotation.y = -swing * 0.12;
  u.neck.rotation.y = swing * 0.06;
  plantFeet(player.obj, u.hips, 0.92 + breathe, [
    { mesh: u.legR.boot, half: u.legR.bootHalf },
    { mesh: u.legL.boot, half: u.legL.bootHalf },
  ]);

  // left arm swings with the walk
  u.armL.shoulder.rotation.x = THREE.MathUtils.lerp(u.armL.shoulder.rotation.x, swing * 0.9, dt * 14);
  u.armL.shoulder.rotation.z = THREE.MathUtils.lerp(u.armL.shoulder.rotation.z, 0.26, dt * 10);
  u.armL.elbow.rotation.x = -0.3 - Math.max(0, swing) * 0.4;

  if (player.attackTime >= 0) {
    const p = player.attackTime / player.attackDur;
    // raise the blade high with the elbow cocked, then chop down and recover
    const wind = Math.sin(Math.min(p / 0.34, 1) * Math.PI * 0.5);
    const slash = p > 0.34 ? Math.min(1, (p - 0.34) / 0.3) : 0;
    const rec = p > 0.64 ? Math.min(1, (p - 0.64) / 0.36) : 0;
    const k = rec * rec * (3 - 2 * rec);
    const L = THREE.MathUtils.lerp;
    u.armR.shoulder.rotation.x = L(-2.1 * wind + slash * 2.6, 0.22, k);
    // keep the arm out from the body: at rotation.z ~ 0 the blade sweeps
    // straight through the skirt on the way down
    u.armR.shoulder.rotation.z = L(Math.min(-0.18, -0.5 * wind + slash * 0.7), -0.26, k);
    u.armR.elbow.rotation.x = L(-1.5 * wind + slash * 1.4, -0.25, k);
    u.torso.rotation.y = L(-0.35 * wind + slash * 0.7, 0, k);
    // the off hand counter-swings instead of hanging dead
    u.armL.shoulder.rotation.x = L(0.55 * wind - slash * 0.65, 0, k);
    u.armL.shoulder.rotation.z = 0.26;
  } else {
    // relaxed guard: sword held low and slightly out, like the concept art
    u.armR.shoulder.rotation.x = THREE.MathUtils.lerp(u.armR.shoulder.rotation.x, 0.22 - swing * 0.5, dt * 10);
    u.armR.shoulder.rotation.z = THREE.MathUtils.lerp(u.armR.shoulder.rotation.z, -0.26, dt * 10);
    u.armR.elbow.rotation.x = THREE.MathUtils.lerp(u.armR.elbow.rotation.x, -0.25, dt * 10);
  }
}

/* --------------------------- camera --------------------------- */
const camTarget = new THREE.Vector3();
const CAM = { dist: 4.6, pivot: 1.55, shoulder: 0.95, aim: 1.85 };

function updateCamera(dt) {
  const elev = -look.pitch;                    // mouse down -> camera swings up
  const dir = new THREE.Vector3(Math.sin(look.yaw), 0, Math.cos(look.yaw));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const ground = heightAt(player.pos.x, player.pos.z);
  const pivotY = ground + CAM.pivot;

  const back = Math.cos(elev) * CAM.dist;
  const want = new THREE.Vector3(
    player.pos.x - dir.x * back + side.x * CAM.shoulder,
    pivotY + Math.sin(elev) * CAM.dist,
    player.pos.z - dir.z * back + side.z * CAM.shoulder);
  want.y = Math.max(want.y, heightAt(want.x, want.z) + 1.2);

  camera.position.lerp(want, 1 - Math.pow(0.0015, dt));
  camTarget.lerp(new THREE.Vector3(
    player.pos.x + side.x * CAM.aim,
    pivotY,
    player.pos.z + side.z * CAM.aim), 1 - Math.pow(0.0015, dt));
  camera.lookAt(camTarget);
}

/* --------------------------- drops / pickup --------------------------- */
function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.t += dt;
    d.obj.rotation.y += dt * 1.6;
    d.obj.position.y = heightAt(d.obj.position.x, d.obj.position.z) + 0.7 + Math.sin(d.t * 2.2) * 0.12;
    if (Math.hypot(d.obj.position.x - player.pos.x, d.obj.position.z - player.pos.z) < 2.0) {
      state.bag.unshift(d.item);
      syncHotbar();
      // auto-equip if it is clearly better, so the demo stays friendly
      const cur = state.equipped[d.item.slot];
      if (!cur || itemScore(d.item) > itemScore(cur)) game.equip(d.item);
      else { ui.renderAll(); ui.toast(`Fandt ${d.item.name}`, 1300); }
      ui.floatText(d.item.name, screenOf(d.obj.position, 1.2), 'loot');
      scene.remove(d.obj);
      drops.splice(i, 1);
    }
  }
}

/* --------------------------- loop --------------------------- */
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  gameTime += dt;

  if (state.running) {
    updatePlayer(dt);
    playerAttack(dt);
    updateMonster(dt);
    updateDrops(dt);
  }
  world.update(dt);
  world.followSun(player.pos);
  if (!window.__djFreeCam) updateCamera(dt);

  // HUD
  const t = totals();
  state.hp = Math.min(state.hp, t.maxHp);
  ui.setBars(
    THREE.MathUtils.clamp(state.hp / t.maxHp, 0, 1),
    THREE.MathUtils.clamp(state.stamina / t.maxStamina, 0, 1),
    THREE.MathUtils.clamp(state.xp / xpForLevel(state.level), 0, 1),
    state.level);

  if (!monster.dead) {
    const s = screenOf(monster.pos, 1.85);
    ui.updateEnemyBar(monster.id, {
      x: s.x, y: s.y,
      visible: s.visible && camera.position.distanceTo(monster.obj.position) < 45,
      pct: monster.hp / monster.maxHp,
    });
  }

  renderer.render(scene, camera);
}

/* --------------------------- flow --------------------------- */
function start() {
  document.getElementById('start').classList.add('hidden');
  document.getElementById('death').classList.add('hidden');
  state.running = true;
  canvas.requestPointerLock?.();
}
function pause() {
  if (ui.inventoryOpen) { ui.toggleInventory(false); return; }
  if (!state.running) return;
  state.running = false;
  document.exitPointerLock?.();
  document.getElementById('start').classList.remove('hidden');
}
function toggleBag() {
  const open = ui.toggleInventory();
  if (open) document.exitPointerLock?.();
  else if (state.running) canvas.requestPointerLock?.();
}
function respawn() {
  state.dead = false;
  state.hp = totals().maxHp;
  state.stamina = totals().maxStamina;
  player.pos.set(0, 0, 6);
  if (monster && !monster.dead) {
    monster.pos.set(0, 0, -14);
    monster.state = 'idle';
  }
  start();
}

document.getElementById('play').addEventListener('click', start);
document.getElementById('respawn').addEventListener('click', respawn);

// starting gear, so the dock reads like the concept art from frame one
const starter = makeItem('weapon', 1, Math.random, RARITIES[0]);
starter.stats = { skade: 14, smidighed: 6 };
starter.name = 'Normal Sværd 1';
game.equip(starter);
state.hp = totals().maxHp;
state.stamina = totals().maxStamina;
ui.renderAll();

// pose the world before the player presses Spil
player.obj.position.set(player.pos.x, heightAt(player.pos.x, player.pos.z), player.pos.z);
player.obj.rotation.y = player.yaw;
updateCamera(1);
frame();

window.__djPose = () => animatePlayer(0.016, false, false);
window.__djHeightAt = heightAt;
window.__djCam = (dt, pitch) => { if (pitch !== undefined) look.pitch = pitch; updateCamera(dt); };

// expose a little of the state for automated look-tests
window.__dj = {
  state, player, camera, scene, totals, screenOf, ui, game, drops,
  get gameTime() { return gameTime; },
  get lootDropped() { return lootDropped; },
  get monster() { return monster; },
  attack() { wantAttack = true; },
  forceAttack(kind) { monster.cooldown = 0; startAttack(monster, kind); },
  dropAt(x, z) { dropLoot(makeItem('armor', state.level), new THREE.Vector3(x, 0, z)); },
  get attacks() { return ATTACKS; },
  give(n = 3) {
    for (let i = 0; i < n; i++) state.bag.push(makeItem(['weapon', 'armor', 'trinket'][i % 3], state.level));
    syncHotbar();
    ui.renderAll();
  },
};
