import * as THREE from 'three';
import { TOWN, heightAt } from './world.js';

/* The town is deliberately small and readable: a handful of cottages around a
   well, a market stall and a healer's hut, ringed by a low fence that marks
   where monsters stop. */

const flat = (color) => new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true });

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cottage(rng, { w = 4.2, d = 3.6, h = 2.6, wall = '#d8c6a4', roof = '#8d4231' } = {}) {
  const g = new THREE.Group();
  const body = box(w, h, d, flat(wall));
  body.position.y = h / 2;
  g.add(body);

  // roof: a four-sided pyramid, squashed along the ridge
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.7, 4), flat(roof));
  r.rotation.y = Math.PI / 4;
  r.position.y = h + 0.82;
  r.scale.set(1, 1, d / w);
  r.castShadow = true;
  g.add(r);

  const beam = flat('#5d3d24');
  for (const sx of [-1, 1]) {
    const post = box(0.18, h, 0.18, beam);
    post.position.set(sx * (w / 2 - 0.12), h / 2, d / 2 - 0.08);
    g.add(post);
  }
  const door = box(0.9, 1.5, 0.12, flat('#5d3d24'));
  door.position.set(0, 0.75, d / 2 + 0.02);
  g.add(door);
  for (const sx of [-1, 1]) {
    const win = box(0.62, 0.62, 0.1, flat('#6f8fa8'));
    win.position.set(sx * (w / 4 + 0.2), h * 0.62, d / 2 + 0.02);
    g.add(win);
  }
  g.rotation.y = (rng() - 0.5) * 0.3;
  return g;
}

function well() {
  const g = new THREE.Group();
  const stone = flat('#9a958c');
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.8, 12), stone);
  ring.position.y = 0.4;
  ring.castShadow = true;
  ring.receiveShadow = true;
  g.add(ring);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.85, 12), new THREE.MeshBasicMaterial({ color: '#2f6f8f' }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.62;
  g.add(water);
  const wood = flat('#6b4a2b');
  for (const sx of [-1, 1]) {
    const post = box(0.16, 1.9, 0.16, wood);
    post.position.set(sx * 0.85, 1.35, 0);
    g.add(post);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), flat('#8d4231'));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.6;
  roof.castShadow = true;
  g.add(roof);
  return g;
}

function stall(color) {
  const g = new THREE.Group();
  const counter = box(2.6, 1.0, 1.0, flat('#7a5433'));
  counter.position.y = 0.5;
  g.add(counter);
  const top = box(2.9, 0.12, 1.2, flat('#8f6640'));
  top.position.y = 1.06;
  g.add(top);
  const wood = flat('#6b4a2b');
  for (const sx of [-1, 1]) {
    const post = box(0.12, 2.3, 0.12, wood);
    post.position.set(sx * 1.35, 1.15, -0.45);
    g.add(post);
  }
  // striped awning
  for (let i = 0; i < 6; i++) {
    const strip = box(0.48, 0.1, 1.6, flat(i % 2 ? color : '#f0ece2'));
    strip.position.set(-1.2 + i * 0.48, 2.32, 0.1);
    strip.rotation.x = -0.22;
    g.add(strip);
  }
  return g;
}

function fencePost(mat) {
  const g = new THREE.Group();
  const post = box(0.16, 1.05, 0.16, mat);
  post.position.y = 0.52;
  g.add(post);
  const cap = box(0.24, 0.1, 0.24, mat);
  cap.position.y = 1.08;
  g.add(cap);
  return g;
}

/** Low fence ring with a gap facing the meadow, so the safe area is obvious. */
function fence() {
  const g = new THREE.Group();
  const mat = flat('#6b4a2b');
  const rail = flat('#7a5433');
  const count = 34;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    // leave a gate gap on the meadow side (-z)
    if (Math.cos(a) > -0.35 && Math.cos(a) < 0.35 && Math.sin(a) < 0) continue;
    const x = TOWN.x + Math.cos(a) * TOWN.radius;
    const z = TOWN.z + Math.sin(a) * TOWN.radius;
    const p = fencePost(mat);
    p.position.set(x, heightAt(x, z), z);
    p.rotation.y = -a;
    g.add(p);

    const next = ((i + 1) / count) * Math.PI * 2;
    if (Math.cos(next) > -0.35 && Math.cos(next) < 0.35 && Math.sin(next) < 0) continue;
    const nx = TOWN.x + Math.cos(next) * TOWN.radius;
    const nz = TOWN.z + Math.sin(next) * TOWN.radius;
    const mid = new THREE.Vector3((x + nx) / 2, heightAt(x, z) + 0.72, (z + nz) / 2);
    const len = Math.hypot(nx - x, nz - z);
    const bar = box(len, 0.1, 0.07, rail);
    bar.position.copy(mid);
    bar.rotation.y = Math.atan2(nz - z, nx - x) * -1;
    g.add(bar);
  }
  return g;
}

function signpost() {
  const g = new THREE.Group();
  const wood = flat('#6b4a2b');
  const post = box(0.16, 2.2, 0.16, wood);
  post.position.y = 1.1;
  g.add(post);
  const board = box(1.6, 0.5, 0.1, flat('#c9a86a'));
  board.position.set(0.5, 1.75, 0);
  board.rotation.z = -0.05;
  g.add(board);
  return g;
}

export function createTown(scene) {
  let seed = 99137;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  const group = new THREE.Group();
  const place = (obj, x, z, yaw = 0) => {
    obj.position.set(x, heightAt(x, z), z);
    obj.rotation.y += yaw;
    group.add(obj);
    return obj;
  };

  // a packed-earth square so the town floor reads apart from the meadow
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(TOWN.radius - 0.4, 40),
    new THREE.MeshLambertMaterial({ color: '#b9a887' }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(TOWN.x, heightAt(TOWN.x, TOWN.z) + 0.02, TOWN.z);
  plaza.receiveShadow = true;
  group.add(plaza);

  place(well(), TOWN.x, TOWN.z + 1.5);
  place(fence(), 0, 0);
  place(signpost(), TOWN.x + 1.6, TOWN.z - TOWN.radius + 1.2, -0.4);

  // cottages around the back half of the ring
  const spots = [
    [-7.5, 6.5, 0.5], [7.5, 6.0, -0.5], [-8.5, -1.5, 1.2], [8.6, -1.0, -1.2], [0.5, 9.0, Math.PI],
  ];
  const walls = ['#d8c6a4', '#cfc0a0', '#e0cdaa', '#d2bd9c', '#dac8a8'];
  const roofs = ['#8d4231', '#7a4a2c', '#94513a', '#6f4433', '#8d4231'];
  spots.forEach(([dx, dz, yaw], i) => {
    place(cottage(rng, { wall: walls[i], roof: roofs[i] }), TOWN.x + dx, TOWN.z + dz, yaw);
  });

  // the two shops the player actually uses, either side of the gate
  const healerStall = place(stall('#4fae62'), TOWN.x - 4.6, TOWN.z - 5.2, 0.35);
  const merchantStall = place(stall('#c9a13a'), TOWN.x + 4.6, TOWN.z - 5.2, -0.35);

  scene.add(group);

  return {
    group,
    // NPCs stand behind their counter, facing the gate the player walks in from
    healerSpot: new THREE.Vector3(TOWN.x - 4.6, 0, TOWN.z - 5.2 + 1.35),
    merchantSpot: new THREE.Vector3(TOWN.x + 4.6, 0, TOWN.z - 5.2 + 1.35),
    healerStall,
    merchantStall,
  };
}
