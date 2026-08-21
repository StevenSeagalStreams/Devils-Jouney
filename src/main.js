import * as THREE from 'three';
import { createWorld, heightAt, TOWN, townDistance } from './world.js';
import { createPlayerModel, createMonsterModel, createWeaponMesh, createNpcModel } from './characters.js';
import { makeItem, itemScore, RARITIES } from './items.js';
import { createTown } from './town.js';
import { KINDS, statsFor } from './monsters.js';
import { createMausoleum, createDungeon, clampToRooms, DUNGEON_ORIGIN, MAUSOLEUM } from './dungeon.js';
import { ABILITIES, abilityPower, abilityScale, unlockedAt } from './abilities.js';
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
  gold: 0,
  bag: [],
  cooldowns: {},
  buffs: { shield: 0, rage: 0 },
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
  const rage = state.buffs.rage > 0 ? 1.6 : 1;
  return {
    maxHp: BASE.hp + liv + (lvl - 1) * 12,
    damage: Math.round((BASE.damage + skade + Math.floor(styrke * 0.6) + (lvl - 1) * 3) * rage),
    smidighed, styrke, liv, tier,
    maxStamina: BASE.stamina + smidighed * 1.5,
    speed: BASE.speed + smidighed * 0.03,
    attackSpeed: 1 + smidighed * 0.008,
  };
}

/* --------------------------- zones --------------------------- */
const mausoleum = createMausoleum();
world.root.add(mausoleum.group);
const dungeon = createDungeon();
dungeon.group.visible = false;
scene.add(dungeon.group);

let zone = 'overworld';

/** Ground height for whichever zone we are standing in. */
function groundY(x, z) {
  return zone === 'dungeon' ? 0 : heightAt(x, z);
}

const ZONES = {
  overworld: {
    fog: ['#c3e0f5', 150, 380], bg: '#8dc5ef',
    enter() {
      world.root.visible = true;
      dungeon.group.visible = false;
      player.pos.copy(mausoleum.door);
      player.pos.z -= 2.2;
      spawnOverworld();
    },
  },
  dungeon: {
    fog: ['#14111a', 14, 60], bg: '#0b0a10',
    enter() {
      world.root.visible = false;
      dungeon.group.visible = true;
      player.pos.copy(dungeon.spawnSpot);
      spawnDungeon();
    },
  },
};

function setZone(next) {
  zone = next;
  const z = ZONES[next];
  clearMonsters();
  arrows.length = 0;
  for (const d of drops.splice(0)) scene.remove(d.obj);
  scene.background = new THREE.Color(z.bg);
  scene.fog = new THREE.Fog(z.fog[0], z.fog[1], z.fog[2]);
  z.enter();
  camSnap = true;
  ui.toast(next === 'dungeon' ? 'Gravkammeret' : 'Engen', 1800);
}

/* --------------------------- town --------------------------- */
const town = createTown(scene);

/** Inside the fence nothing can hurt you. */
function inTown(pos = player.pos) {
  return townDistance(pos.x, pos.z) < TOWN.radius;
}

const npcs = [
  { kind: 'healer', name: 'Helbrederen', hint: 'hele dig', spot: town.healerSpot, obj: createNpcModel('healer') },
  { kind: 'merchant', name: 'Handelsmanden', hint: 'handle', spot: town.merchantSpot, obj: createNpcModel('merchant') },
];
for (const npc of npcs) {
  npc.obj.position.set(npc.spot.x, heightAt(npc.spot.x, npc.spot.z), npc.spot.z);
  npc.obj.rotation.y = Math.PI;          // face out over the counter, toward the gate
  scene.add(npc.obj);
}
let nearNpc = null;

function updateNpcs(dt) {
  for (const npc of npcs) {
    npc.obj.userData.bob += dt * 1.5;
    npc.obj.position.y = heightAt(npc.spot.x, npc.spot.z) + Math.sin(npc.obj.userData.bob) * 0.03;
  }
  // closest one you could talk to
  let best = null, bestD = 3.0;
  for (const npc of npcs) {
    const d = Math.hypot(npc.spot.x - player.pos.x, npc.spot.z - player.pos.z);
    if (d < bestD) { bestD = d; best = npc; }
  }
  nearNpc = best;

  // the way down, and the way back up
  nearDoor = null;
  if (zone === 'overworld') {
    const d = Math.hypot(player.pos.x - mausoleum.door.x, player.pos.z - mausoleum.door.z);
    if (d < 2.6) nearDoor = { to: 'dungeon', label: 'gå ned i gravkammeret' };
  } else {
    const d = Math.hypot(player.pos.x - dungeon.exitSpot.x, player.pos.z - dungeon.exitSpot.z);
    if (d < 2.6) nearDoor = { to: 'overworld', label: 'gå op i dagslyset' };
  }

  if (ui.shopOpen || ui.inventoryOpen) ui.hidePrompt();
  else if (best) ui.showPrompt(`<b>E</b> — tal med ${best.name} for at ${best.hint}`);
  else if (nearDoor) ui.showPrompt(`<b>E</b> — ${nearDoor.label}`);
  else ui.hidePrompt();
}
let nearDoor = null;

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

/* --------------------------- creatures --------------------------- */
const monsters = [];
let monsterSeq = 0;

// one telegraph ring per creature that is winding up
const telegraphs = new Map();
function telegraphFor(id) {
  let t = telegraphs.get(id);
  if (!t) {
    t = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.0, 40),
      new THREE.MeshBasicMaterial({ color: '#ff5a3c', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    t.rotation.x = -Math.PI / 2;
    t.renderOrder = 2;
    scene.add(t);
    telegraphs.set(id, t);
  }
  return t;
}
function dropTelegraph(id) {
  const t = telegraphs.get(id);
  if (t) { scene.remove(t); t.geometry.dispose(); t.material.dispose(); telegraphs.delete(id); }
}

function spawnMonster(kindId, level, pos) {
  const k = KINDS[kindId];
  const base = statsFor(kindId, level);
  const m = {
    id: ++monsterSeq,
    kindId,
    kind: k,
    obj: k.model(level),
    pos: pos.clone(),
    yaw: Math.PI,
    level,
    ...base,
    state: 'idle',
    stateT: 0,
    atk: null,
    cooldown: 0,
    lastHeavy: false,
    hurt: 0,
    angry: 0,            // passive creatures only fight while this is running
    walkPhase: 0,
    home: pos.clone(),
    wander: new THREE.Vector3(),
    dead: false,
    deadT: 0,
  };
  m.obj.position.copy(m.pos);
  m.obj.scale.setScalar(k.scale * (0.92 + Math.min(level, 10) * 0.012));
  scene.add(m.obj);
  monsters.push(m);
  return m;
}

function clearMonsters() {
  for (const m of monsters) { scene.remove(m.obj); dropTelegraph(m.id); ui.removeEnemyBar(m.id); }
  monsters.length = 0;
}

/** Nearest living creature — keeps the old single-monster helpers working. */
function nearestMonster() {
  let best = null, bestD = Infinity;
  for (const m of monsters) {
    if (m.dead) continue;
    const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function startAttack(m, kindName) {
  const a = m.kind.attacks[kindName];
  if (!a) return;
  m.atk = { ...a, t: 0, hasHit: false };
  m.state = 'attack';
  m.stateT = 0;
  m.lastHeavy = a.kind === 'heavy';
}

function updateTelegraph(m) {
  const a = m.state === 'attack' ? m.atk : null;
  if (!a || a.hasHit || m.dead) { dropTelegraph(m.id); return; }
  const t = telegraphFor(m.id);
  const p = THREE.MathUtils.clamp(a.t / a.hit, 0, 1);
  t.visible = true;
  t.position.set(m.pos.x, groundY(m.pos.x, m.pos.z) + 0.06, m.pos.z);
  // a ranged shot shows a short warning ring, not its whole flight distance
  const reach = a.projectile ? 2.2 : a.range;
  t.scale.setScalar(Math.max(0.05, reach * p));
  t.material.color.set(a.tell);
  t.material.opacity = 0.25 + 0.6 * p;
}

/* ----------------------------- arrows ----------------------------- */
const arrows = [];
let arrowsFired = 0;
function fireArrow(m, damage) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 5), new THREE.MeshLambertMaterial({ color: '#c9a86a' }));
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), new THREE.MeshBasicMaterial({ color: '#8ef0ff' }));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.52;
  g.add(tip);
  const from = new THREE.Vector3(m.pos.x, groundY(m.pos.x, m.pos.z) + 1.25, m.pos.z);
  const to = new THREE.Vector3(player.pos.x, groundY(player.pos.x, player.pos.z) + 1.0, player.pos.z);
  const dir = to.sub(from).normalize();
  g.position.copy(from);
  g.lookAt(from.clone().add(dir));
  scene.add(g);
  arrows.push({ obj: g, dir, speed: 15, damage, life: 2.2 });
  arrowsFired++;
}

function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.life -= dt;
    a.obj.position.addScaledVector(a.dir, a.speed * dt);
    const p = a.obj.position;
    const hit = Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 0.75
      && Math.abs(p.y - (groundY(player.pos.x, player.pos.z) + 1.0)) < 1.2;
    if (hit) hurtPlayer(a.damage);
    if (hit || a.life <= 0 || p.y < groundY(p.x, p.z) - 0.2) {
      scene.remove(a.obj);
      arrows.splice(i, 1);
    }
  }
}

/* --------------------------- creature AI --------------------------- */
function updateMonsters(dt) {
  for (let i = monsters.length - 1; i >= 0; i--) updateMonster(monsters[i], dt, i);
  updateArrows(dt);
}

function updateMonster(m, dt, index) {
  m.stateT += dt;
  m.hurt = Math.max(0, m.hurt - dt);
  m.cooldown = Math.max(0, m.cooldown - dt);
  if (m.angry > 0) m.angry -= dt;

  if (m.dead) {
    m.deadT += dt;
    m.obj.rotation.x = THREE.MathUtils.lerp(m.obj.rotation.x, -Math.PI / 2.2, dt * 6);
    m.obj.position.y = THREE.MathUtils.lerp(m.obj.position.y, groundY(m.pos.x, m.pos.z) - 0.3, dt * 4);
    dropTelegraph(m.id);
    if (m.deadT > 3.0) {
      scene.remove(m.obj);
      ui.removeEnemyBar(m.id);
      monsters.splice(index, 1);
      scheduleRespawn(m);
    }
    return;
  }

  const toPlayer = tmpV.copy(player.pos).sub(m.pos);
  toPlayer.y = 0;
  const dist = toPlayer.length();
  toPlayer.normalize();

  const k = m.kind;
  const hostile = (!k.passive || m.angry > 0) && !inTown();
  const homeDist = Math.hypot(m.pos.x - m.home.x, m.pos.z - m.home.z);

  if (m.state === 'idle') {
    if (m.stateT > 2.5) {
      m.stateT = 0;
      const a = Math.random() * Math.PI * 2;
      m.wander.set(Math.cos(a), 0, Math.sin(a));
      // drift back if it has strayed far from where it started
      if (homeDist > 8) m.wander.set(m.home.x - m.pos.x, 0, m.home.z - m.pos.z).normalize();
    }
    const step = m.wander.clone().multiplyScalar(0.7 * dt);
    m.pos.add(step);
    if (step.lengthSq() > 1e-6) m.yaw = Math.atan2(step.x, step.z);
    m.walkPhase += dt * 3;
    if (hostile && dist < k.sight) { m.state = 'chase'; m.stateT = 0; }
  } else if (m.state === 'chase') {
    m.yaw = turnTowards(m.yaw, Math.atan2(toPlayer.x, toPlayer.z), dt * 6);
    const band = k.keepAway;
    if (band && dist < band.min) {
      m.pos.addScaledVector(toPlayer, -m.speed * dt);          // archers give ground
      m.walkPhase += dt * 7;
    } else if (band && dist > band.max) {
      m.pos.addScaledVector(toPlayer, m.speed * dt);
      m.walkPhase += dt * 7;
    } else if (!band) {
      if (m.cooldown > 0 && dist < 2.4) {
        m.pos.addScaledVector(toPlayer, -m.speed * 0.55 * dt);
        m.walkPhase += dt * 5;
      } else if (dist > 1.9) {
        m.pos.addScaledVector(toPlayer, m.speed * dt);
        m.walkPhase += dt * 8;
      }
    }
    const reach = band ? band.max : 2.3;
    if (dist < reach && m.cooldown <= 0 && hostile) startAttack(m, k.choose(m));
    if (!hostile || dist > k.leash) { m.state = 'idle'; m.stateT = 0; }
  } else if (m.state === 'attack') {
    const a = m.atk;
    a.t += dt;
    if (a.track > 0 && !a.hasHit) {
      m.yaw = turnTowards(m.yaw, Math.atan2(toPlayer.x, toPlayer.z), dt * a.track);
    }
    if (!a.hasHit && a.t >= a.hit) {
      a.hasHit = true;
      if (a.projectile) {
        fireArrow(m, m.damage * a.dmg);
      } else {
        const facing = tmpFacing.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
        if (dist < a.range && toPlayer.dot(facing) > 0.25) {
          hurtPlayer(m.damage * a.dmg * (0.9 + Math.random() * 0.2));
        } else {
          ui.floatText('forbi!', screenOf(m.pos, k.barY), 'loot');
        }
      }
    }
    if (a.t >= a.hit + a.recover) {
      m.state = dist < k.leash ? 'chase' : 'idle';
      m.stateT = 0;
      m.cooldown = a.cooldown;
    }
  }

  // the town fence turns everything away
  const townD = townDistance(m.pos.x, m.pos.z);
  const keepOut = TOWN.radius + 1.5;
  if (zone === 'overworld' && townD < keepOut) {
    const away = tmpFacing.set(m.pos.x - TOWN.x, 0, m.pos.z - TOWN.z);
    if (away.lengthSq() < 1e-6) away.set(0, 0, -1);
    away.normalize();
    m.pos.set(TOWN.x + away.x * keepOut, 0, TOWN.z + away.z * keepOut);
    if (m.state === 'attack') { m.state = 'idle'; m.stateT = 0; m.atk = null; }
  }
  if (m.state !== 'idle' && inTown()) { m.state = 'idle'; m.stateT = 0; m.atk = null; }

  if (zone === 'dungeon') clampToRooms(m.pos);

  // never stand inside the player
  const sep = tmpV.copy(m.pos).sub(player.pos);
  sep.y = 0;
  const sepD = sep.length();
  if (sepD < 1.4 && sepD > 0.001) m.pos.copy(player.pos).addScaledVector(sep.normalize(), 1.4);
  m.pos.y = 0;

  if (zone === 'overworld') {
    m.pos.x = THREE.MathUtils.clamp(m.pos.x, -90, 90);
    m.pos.z = THREE.MathUtils.clamp(m.pos.z, -90, 90);
  }
  m.obj.position.set(m.pos.x, groundY(m.pos.x, m.pos.z), m.pos.z);
  m.obj.rotation.y = m.yaw;
  updateTelegraph(m);
  animateMonster(m, dt);
}

function animateMonster(m, dt) {
  const u = m.obj.userData;
  const chasing = m.state === 'chase';
  const swing = Math.sin(m.walkPhase) * (chasing ? 0.55 : 0.2);
  u.legR.hip.rotation.x = swing;
  u.legL.hip.rotation.x = -swing;
  u.legR.knee.rotation.x = Math.max(0, -swing) * 0.6;
  u.legL.knee.rotation.x = Math.max(0, swing) * 0.6;
  const feet = [
    { mesh: u.legR.foot, half: u.legR.footHalf },
    { mesh: u.legL.foot, half: u.legL.footHalf },
  ];
  if (u.backR) {
    u.backR.hip.rotation.x = -swing;
    u.backL.hip.rotation.x = swing;
    feet.push({ mesh: u.backR.foot, half: u.backR.footHalf },
      { mesh: u.backL.foot, half: u.backL.footHalf });
  }
  plantFeet(m.obj, u.body, m.kindId === 'boar' ? 0.62 : m.kindId === 'archer' ? 0.92 : m.kindId === 'guard' ? 1.02 : 0.98, feet);
  u.headPivot.rotation.x = (m.kindId === 'brute' ? -0.22 : 0) + Math.sin(m.walkPhase * 0.5) * 0.05;

  const idle = Math.sin(m.walkPhase * 0.9) * 0.25;
  if (m.state === 'attack' && m.atk && u.armR) {
    const a = m.atk;
    const p = THREE.MathUtils.clamp(a.t / a.hit, 0, 1);
    const post = THREE.MathUtils.clamp((a.t - a.hit) / a.recover, 0, 1);
    const ease = post * post * (3 - 2 * post);
    const L = THREE.MathUtils.lerp;
    if (a.kind === 'skud') {
      // draw the bow, then loose
      u.armL.shoulder.rotation.x = -1.5;
      u.armR.shoulder.rotation.x = L(-1.2 - p * 0.4, -0.2, ease);
      u.armR.elbow.rotation.x = L(-1.4 * p, -0.2, ease);
    } else if (a.kind === 'heavy' || a.kind === 'bash') {
      const raise = Math.sin(p * Math.PI * 0.5) * 2.6;
      u.armR.shoulder.rotation.x = L(-raise + ease * 3.2, idle, ease * 0.7);
      if (a.kind === 'heavy') u.armL.shoulder.rotation.x = L(-raise + ease * 3.2, -idle, ease * 0.7);
      if (u.lean) u.lean.rotation.x = (m.kindId === 'guard' ? 0.12 : 0.3) - 0.28 * p + 0.5 * ease;
    } else {
      const cock = Math.sin(p * Math.PI * 0.5) * 1.4;
      u.armR.shoulder.rotation.x = L(-cock + ease * 2.3, idle, ease * 0.75);
      u.armL.shoulder.rotation.x = L(cock * 0.25, -idle, ease * 0.75);
      if (u.lean) u.lean.rotation.x = (m.kindId === 'guard' ? 0.12 : 0.3) + 0.12 * p;
    }
  } else if (u.armR) {
    u.armR.shoulder.rotation.x = THREE.MathUtils.lerp(u.armR.shoulder.rotation.x, idle, dt * 6);
    u.armL.shoulder.rotation.x = THREE.MathUtils.lerp(u.armL.shoulder.rotation.x, -idle, dt * 6);
    if (u.lean) u.lean.rotation.x = THREE.MathUtils.lerp(u.lean.rotation.x, m.kindId === 'guard' ? 0.12 : m.kindId === 'brute' ? 0.3 : 0, dt * 6);
  } else if (m.kindId === 'boar' && m.state === 'attack' && m.atk) {
    // the boar has no arms: it lunges with its head
    const p = THREE.MathUtils.clamp(m.atk.t / m.atk.hit, 0, 1);
    u.headPivot.rotation.x = -0.5 * p;
  }

  // hit flash wins; otherwise the body glows while a blow is winding up
  const hurt = m.hurt > 0;
  let r = 0, g = 0, bl = 0;
  if (hurt) { r = 0.45; g = 0.1; bl = 0.1; }
  else if (m.state === 'attack' && m.atk && !m.atk.hasHit) {
    const charge = THREE.MathUtils.clamp(m.atk.t / m.atk.hit, 0, 1);
    const big = m.atk.dmg >= 1.8;
    r = charge * (big ? 0.45 : 0.24);
    g = charge * (big ? 0.06 : 0.16);
  }
  m.obj.traverse(o => {
    if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setRGB(r, g, bl);
  });
}

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
  g.position.set(pos.x, groundY(pos.x, pos.z) + 0.7, pos.z);
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
  if (k === 'escape') {
    if (ui.shopOpen) { ui.closeShop(); return; }
    pause();
    return;
  }
  if (k === 'e') { talk(); return; }
  if (k >= '1' && k <= '8') {
    useAbility(+k - 1);
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
  if (!locked && hadLock && state.running && !ui.inventoryOpen && !ui.shopOpen) pause();
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
  useAbility,
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
    ui.renderAll();
  },
  stock: [],
  stockLevel: 0,
  restock() {
    this.stockLevel = state.level;
    this.stock = [];
    const types = ['weapon', 'armor', 'trinket', 'weapon'];
    for (const t of types) this.stock.push(makeItem(t, Math.max(1, state.level), Math.random));
  },
  buyPrice(item) { return Math.max(6, Math.round(10 + itemScore(item) * 1.35)); },
  sellPrice(item) { return Math.max(2, Math.round(this.buyPrice(item) * 0.4)); },
  healCost() {
    const missing = Math.max(0, totals().maxHp - state.hp);
    return missing <= 0 ? 0 : Math.max(4, Math.ceil(missing * 0.55));
  },
  buyHeal() {
    const cost = this.healCost();
    if (cost <= 0 || state.gold < cost) return;
    state.gold -= cost;
    state.hp = totals().maxHp;
    ui.setGold(state.gold);
    ui.renderStats();
    ui.toast('Du føler dig frisk igen', 1300);
  },
  buyItem(item) {
    const price = this.buyPrice(item);
    if (state.gold < price) return;
    const i = this.stock.indexOf(item);
    if (i < 0) return;
    this.stock.splice(i, 1);
    state.gold -= price;
    state.bag.unshift(item);
    ui.setGold(state.gold);
    ui.renderAll();
    ui.toast(`Købte ${item.name}`, 1200);
  },
  sellItem(item) {
    const i = state.bag.indexOf(item);
    if (i < 0) return;
    state.bag.splice(i, 1);
    state.gold += this.sellPrice(item);
    ui.setGold(state.gold);
    ui.renderAll();
  },
  dropItem(item) {
    const i = state.bag.indexOf(item);
    if (i < 0) return;
    state.bag.splice(i, 1);
    ui.renderAll();
    ui.toast(`Smed ${item.name} væk`, 1100);
  },
};

const ui = new UI(game);
ui.onShopClose = () => { if (state.running && !ui.inventoryOpen) canvas.requestPointerLock?.(); };

/* --------------------------- combat helpers --------------------------- */
const tmpV = new THREE.Vector3();
const tmpFoot = new THREE.Vector3();
const tmpFacing = new THREE.Vector3();

/** Turn the short way round. Lerping raw angles spins almost full circle
 *  whenever the target crosses the -pi/+pi wrap. */
function turnTowards(current, target, t) {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return current + d * Math.min(1, t);
}

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
    const fresh = ABILITIES.find(a => a.unlock === state.level);
    ui.toast(fresh ? `Niveau ${state.level} — ny evne: ${fresh.name} (${fresh.key})` : `Niveau ${state.level}!`, 2200);
    ui.floatText(`Niveau ${state.level}`, screenOf(player.pos, 2.4), 'xp');
    ui.renderStats();
  }
}

function damageMonster(m, amount, crit) {
  if (!m || m.dead) return;
  // a shield guard shrugs off anything that comes at its face
  let blocked = false;
  if (m.kind.blockFront) {
    const to = tmpFacing.set(player.pos.x - m.pos.x, 0, player.pos.z - m.pos.z).normalize();
    const facing = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    if (to.dot(facing) > 0.35) { amount = Math.max(1, Math.round(amount * (1 - m.kind.blockFront))); blocked = true; }
  }
  m.hp -= amount;
  m.hurt = 0.18;
  // hitting a peaceful creature makes it a problem
  if (m.kind.passive) { m.angry = 12; if (m.state === 'idle') { m.state = 'chase'; m.stateT = 0; } }
  ui.floatText(blocked ? `blokeret ${amount}` : `${amount}`, screenOf(m.pos, m.kind.barY),
    blocked ? 'loot' : crit ? 'crit' : 'dmg');
  if (m.hp <= 0) killMonster(m);
}

function killMonster(m) {
  m.dead = true;
  m.state = 'dead';
  m.deadT = 0;
  gainXp(m.xp);
  ui.floatText(`+${m.xp} xp`, screenOf(m.pos, m.kind.barY + 0.3), 'xp');
  const gold = m.gold + Math.floor(Math.random() * 4);
  state.gold += gold;
  ui.setGold(state.gold);
  ui.floatText(`+${gold} guld`, screenOf(m.pos, m.kind.barY - 0.4), 'gold');
  ui.removeEnemyBar(m.id);

  // most kills give something; the tougher the creature the better the odds
  const chance = m.kind.passive ? 0.45 : 0.85;
  if (Math.random() < chance) {
    const roll = Math.random();
    const type = roll < 0.5 ? 'weapon' : roll < 0.82 ? 'armor' : 'trinket';
    dropLoot(makeItem(type, Math.max(1, state.level), Math.random), m.pos);
  }
}

/** Bring the same kind back at its post after a breather. */
const pendingSpawns = [];
function scheduleRespawn(m) {
  pendingSpawns.push({ kindId: m.kindId, home: m.home.clone(), t: 8 + Math.random() * 6, zone });
}
function updateRespawns(dt) {
  for (let i = pendingSpawns.length - 1; i >= 0; i--) {
    const p = pendingSpawns[i];
    if (p.zone !== zone) { pendingSpawns.splice(i, 1); continue; }
    p.t -= dt;
    if (p.t <= 0) {
      spawnMonster(p.kindId, monsterLevel(), p.home);
      pendingSpawns.splice(i, 1);
    }
  }
}

function monsterLevel() {
  return Math.max(1, state.level + (zone === 'dungeon' ? 1 : 0));
}

function spawnOverworld() {
  // peaceful wildlife only — nothing out here starts a fight
  const spots = [[-18, -24], [24, -18], [-34, 12], [30, 16], [8, -34], [-8, 40]];
  for (const [x, z] of spots) {
    spawnMonster('boar', Math.max(1, state.level), new THREE.Vector3(x, 0, z));
  }
}

function spawnDungeon() {
  for (const post of dungeon.posts) spawnMonster(post.kind, monsterLevel(), post.pos);
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
    const hit = monstersInRange(player.pos, 3.0, 0.35);
    if (hit.length) {
      const crit = Math.random() < 0.12 + t.smidighed * 0.004;
      const raw = t.damage * (0.9 + Math.random() * 0.2) * (crit ? 1.8 : 1);
      for (const m of hit) damageMonster(m, Math.max(1, Math.round(raw)), crit);
    } else {
      ui.floatText('svup!', screenOf(player.pos, 2.0), 'dmg');
    }
  }
  if (player.attackTime > player.attackDur) player.attackTime = -1;
}

function hurtPlayer(amount) {
  if (inTown()) return;             // the fence is the safe line
  if (state.buffs.shield > 0) amount *= 0.5;
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

/* --------------------------- abilities --------------------------- */
// short-lived expanding rings so every ability reads on screen
const fx = [];
function ringFx(x, z, radius, color, life = 0.45) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.78, 1.0, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, groundY(x, z) + 0.08, z);
  mesh.scale.setScalar(0.2);
  scene.add(mesh);
  fx.push({ mesh, t: 0, life, radius });
}
function burstFx(pos, color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  mesh.position.copy(pos);
  mesh.position.y += 1.0;
  scene.add(mesh);
  fx.push({ mesh, t: 0, life: 0.35, radius: 2.2, grow: true });
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    const p = f.t / f.life;
    f.mesh.scale.setScalar(0.2 + p * f.radius);
    f.mesh.material.opacity = Math.max(0, 0.85 * (1 - p));
    if (p >= 1) { scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); fx.splice(i, 1); }
  }
}

/** Every living creature inside a radius, optionally limited to a front arc. */
function monstersInRange(origin, range, arc = null) {
  const out = [];
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  for (const m of monsters) {
    if (m.dead) continue;
    const dx = m.pos.x - origin.x, dz = m.pos.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    if (arc !== null && ((dx / (d || 1)) * fx + (dz / (d || 1)) * fz) < arc) continue;
    out.push(m);
  }
  return out;
}

function useAbility(index) {
  const ability = ABILITIES[index];
  if (!ability || !state.running || state.dead) return false;
  if (state.level < ability.unlock) {
    ui.toast(`${ability.name} låses op på niveau ${ability.unlock}`, 1400);
    return false;
  }
  if ((state.cooldowns[ability.id] || 0) > 0) return false;
  const t = totals();
  if (ability.stamina > state.stamina) {
    ui.toast('Ikke nok udholdenhed', 1100);
    return false;
  }

  const power = abilityPower(ability, state.level, t);
  state.stamina -= ability.stamina;
  state.cooldowns[ability.id] = ability.cooldown;

  switch (ability.kind) {
    case 'melee': {
      player.attackTime = 0;                    // reuse the sword swing
      player.attackDur = 0.42;
      player.hasHit = true;                     // this ability does the damage itself
      const hit = monstersInRange(player.pos, ability.range, ability.arc);
      for (const m of hit) damageMonster(m, power, true);
      if (!hit.length) ui.floatText('forbi!', screenOf(player.pos, 2.0), 'loot');
      break;
    }
    case 'aoe': {
      ringFx(player.pos.x, player.pos.z, ability.range, ability.color, 0.5);
      player.attackTime = 0;
      player.attackDur = 0.5;
      player.hasHit = true;
      for (const m of monstersInRange(player.pos, ability.range)) damageMonster(m, power, true);
      break;
    }
    case 'charge': {
      const dir = tmpFacing.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      player.pos.addScaledVector(dir, ability.dash);
      ringFx(player.pos.x, player.pos.z, ability.range, ability.color, 0.4);
      for (const m of monstersInRange(player.pos, ability.range)) {
        damageMonster(m, power, true);
        m.pos.addScaledVector(dir, 2.2);        // shove it back
        m.state = 'chase';
        m.atk = null;
        m.cooldown = Math.max(m.cooldown, 0.8);
      }
      break;
    }
    case 'heal': {
      state.hp = Math.min(t.maxHp, state.hp + power);
      ringFx(player.pos.x, player.pos.z, 2.2, ability.color, 0.5);
      ui.floatText(`+${power}`, screenOf(player.pos, 2.2), 'loot');
      ui.renderStats();
      break;
    }
    case 'buff': {
      state.buffs[ability.buff] = ability.duration;
      ringFx(player.pos.x, player.pos.z, 2.4, ability.color, 0.5);
      ui.floatText(ability.name, screenOf(player.pos, 2.4), 'xp');
      break;
    }
    case 'bolt': {
      const hit = monstersInRange(player.pos, ability.range);
      if (!hit.length) { ui.floatText('ingen fjende i sigte', screenOf(player.pos, 2.0), 'loot'); break; }
      for (const m of hit) { burstFx(m.obj.position, ability.color); damageMonster(m, power, true); }
      break;
    }
  }
  ui.toast(ability.name, 900);
  return true;
}

function updateAbilities(dt) {
  for (const id in state.cooldowns) {
    if (state.cooldowns[id] > 0) state.cooldowns[id] = Math.max(0, state.cooldowns[id] - dt);
  }
  for (const k in state.buffs) {
    if (state.buffs[k] > 0) state.buffs[k] = Math.max(0, state.buffs[k] - dt);
  }
  updateFx(dt);
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
    player.yaw = turnTowards(player.yaw, Math.atan2(move.x, move.z), 1 - Math.pow(0.0001, dt));
    player.walkPhase += dt * (sprinting ? 12 : 8);
  } else {
    player.walkPhase += dt * 1.6;
  }

  // stamina
  state.stamina = THREE.MathUtils.clamp(
    state.stamina + (sprinting ? -18 : 14) * dt, 0, t.maxStamina);
  if (sprinting) state.stamina = Math.max(0, state.stamina);

  // slow health regen out of combat
  if (inTown()) {
    state.hp = Math.min(t.maxHp, state.hp + 9 * dt);
  } else if (!monstersInRange(player.pos, 14).length) {
    state.hp = Math.min(t.maxHp, state.hp + 3.5 * dt);
  }

  for (const npc of npcs) {
    const dx = player.pos.x - npc.spot.x, dz = player.pos.z - npc.spot.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.85 && d > 1e-4) {
      player.pos.x = npc.spot.x + (dx / d) * 0.85;
      player.pos.z = npc.spot.z + (dz / d) * 0.85;
    }
  }

  if (zone === 'dungeon') {
    clampToRooms(player.pos);
  } else {
    const lim = 90;
    player.pos.x = THREE.MathUtils.clamp(player.pos.x, -lim, lim);
    player.pos.z = THREE.MathUtils.clamp(player.pos.z, -lim, lim);
  }
  player.obj.position.set(player.pos.x, groundY(player.pos.x, player.pos.z), player.pos.z);
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
let camSnap = true;
const CAM = { dist: 4.6, pivot: 1.55, shoulder: 0.95, aim: 1.85 };

function updateCamera(dt) {
  const elev = -look.pitch;                    // mouse down -> camera swings up
  const dir = new THREE.Vector3(Math.sin(look.yaw), 0, Math.cos(look.yaw));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const ground = groundY(player.pos.x, player.pos.z);
  const pivotY = ground + CAM.pivot;

  const back = Math.cos(elev) * CAM.dist;
  const want = new THREE.Vector3(
    player.pos.x - dir.x * back + side.x * CAM.shoulder,
    pivotY + Math.sin(elev) * CAM.dist,
    player.pos.z - dir.z * back + side.z * CAM.shoulder);
  if (zone !== 'dungeon') want.y = Math.max(want.y, heightAt(want.x, want.z) + 1.2);

  if (camSnap) camera.position.copy(want); else camera.position.lerp(want, 1 - Math.pow(0.0015, dt));
  camTarget.lerp(new THREE.Vector3(
    player.pos.x + side.x * CAM.aim,
    pivotY,
    player.pos.z + side.z * CAM.aim), camSnap ? 1 : 1 - Math.pow(0.0015, dt));
  camSnap = false;
  camera.lookAt(camTarget);
}

/* --------------------------- drops / pickup --------------------------- */
function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.t += dt;
    d.obj.rotation.y += dt * 1.6;
    d.obj.position.y = groundY(d.obj.position.x, d.obj.position.z) + 0.7 + Math.sin(d.t * 2.2) * 0.12;
    if (Math.hypot(d.obj.position.x - player.pos.x, d.obj.position.z - player.pos.z) < 2.0) {
      state.bag.unshift(d.item);
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
    updateMonsters(dt);
    updateRespawns(dt);
    updateDrops(dt);
    updateNpcs(dt);
    updateAbilities(dt);
  }
  if (zone === 'dungeon') dungeon.update(dt, gameTime);
  else { world.update(dt); world.followSun(player.pos); }
  if (!window.__djFreeCam) updateCamera(dt);

  // HUD
  const t = totals();
  state.hp = Math.min(state.hp, t.maxHp);
  ui.renderAbilities();
  ui.renderBuffs(state.buffs);
  ui.setBars(
    THREE.MathUtils.clamp(state.hp / t.maxHp, 0, 1),
    THREE.MathUtils.clamp(state.stamina / t.maxStamina, 0, 1),
    THREE.MathUtils.clamp(state.xp / xpForLevel(state.level), 0, 1),
    state.level);

  for (const m of monsters) {
    if (m.dead) { ui.removeEnemyBar(m.id); continue; }
    const p = screenOf(m.pos, m.kind.barY);
    ui.updateEnemyBar(m.id, {
      x: p.x, y: p.y,
      visible: p.visible && camera.position.distanceTo(m.obj.position) < 45,
      pct: m.hp / m.maxHp,
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
function talk() {
  if (ui.shopOpen) { ui.closeShop(); return; }
  if (!state.running) return;
  if (!nearNpc) {
    if (nearDoor) setZone(nearDoor.to);
    return;
  }
  document.exitPointerLock?.();
  if (nearNpc.kind === 'healer') ui.openHealer(game);
  else {
    if (!game.stock.length || game.stockLevel !== state.level) game.restock();
    ui.openMerchant(game);
  }
}

function toggleBag() {
  const open = ui.toggleInventory();
  if (open) document.exitPointerLock?.();
  else if (state.running) canvas.requestPointerLock?.();
}
function respawn() {
  state.dead = false;
  camSnap = true;
  state.hp = totals().maxHp;
  state.stamina = totals().maxStamina;
  player.pos.set(0, 0, 6);
  for (const m of monsters) { m.state = 'idle'; m.stateT = 0; m.atk = null; m.angry = 0; }
  start();
}

document.getElementById('play').addEventListener('click', start);
document.getElementById('respawn').addEventListener('click', respawn);

// starting gear, so the dock reads like the concept art from frame one
const starter = makeItem('weapon', 1, Math.random, RARITIES[0]);
starter.stats = { skade: 8 };
starter.name = 'Normal Sværd 1';
game.equip(starter);
state.hp = totals().maxHp;
state.stamina = totals().maxStamina;
ui.renderAll();
ui.setGold(state.gold);

spawnOverworld();

// pose the world before the player presses Spil
player.obj.position.set(player.pos.x, heightAt(player.pos.x, player.pos.z), player.pos.z);
player.obj.rotation.y = player.yaw;
updateCamera(1);
frame();

window.__djPose = () => animatePlayer(0.016, false, false);
window.__djHeightAt = heightAt;
window.__djKeys = keys;
window.__djStep = (dt) => { updatePlayer(dt); };
window.__djLook = (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; camSnap = true; };
window.__djCam = (dt, pitch) => { if (pitch !== undefined) look.pitch = pitch; updateCamera(dt); };

// expose a little of the state for automated look-tests
window.__dj = {
  state, player, camera, scene, totals, screenOf, ui, game, drops,
  get gameTime() { return gameTime; },
  town: TOWN,
  inTown,
  get lootDropped() { return lootDropped; },
  monsters,
  arrows,
  get arrowsFired() { return arrowsFired; },
  makeItem,
  damageMonster,
  get monster() { return nearestMonster() || monsters[0]; },
  get zone() { return zone; },
  setZone,
  mausoleum, dungeon,
  attack() { wantAttack = true; },
  useAbility,
  abilities: ABILITIES,
  forceAttack(kind) { const m = nearestMonster() || monsters[0]; if (m) { m.cooldown = 0; startAttack(m, kind); } },
  dropAt(x, z) { dropLoot(makeItem('armor', state.level), new THREE.Vector3(x, 0, z)); },
  get attacks() { return ATTACKS; },
  give(n = 3) {
    for (let i = 0; i < n; i++) state.bag.push(makeItem(['weapon', 'armor', 'trinket'][i % 3], state.level));
    ui.renderAll();
  },
};
