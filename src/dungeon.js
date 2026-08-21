import * as THREE from 'three';
import { heightAt } from './world.js';

/* The mausoleum stands out in the meadow; the crypt itself is built far away
   in its own patch of world and simply swapped in when you go down the steps. */

export const MAUSOLEUM = { x: -26, z: -6 };
export const DUNGEON_ORIGIN = new THREE.Vector3(2000, 0, 2000);

const flat = c => new THREE.MeshLambertMaterial({ color: new THREE.Color(c), flatShading: true });
const stone = () => flat('#8f8b82');
const darkStone = () => flat('#5f5b55');

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ----------------------------- entrance ----------------------------- */
export function createMausoleum() {
  const g = new THREE.Group();
  const base = heightAt(MAUSOLEUM.x, MAUSOLEUM.z);
  g.position.set(MAUSOLEUM.x, base, MAUSOLEUM.z);

  const plinth = box(8.4, 0.5, 7.4, darkStone());
  plinth.position.y = 0.25;
  g.add(plinth);
  const steps = box(3.4, 0.22, 1.2, darkStone());
  steps.position.set(0, 0.16, -3.9);
  g.add(steps);

  // walls with a doorway gap on the south face
  const H = 4.0;
  const wallMat = stone();
  const back = box(7.4, H, 0.6, wallMat);
  back.position.set(0, H / 2 + 0.5, 3.1);
  g.add(back);
  for (const sx of [-1, 1]) {
    const side = box(0.6, H, 6.2, wallMat);
    side.position.set(sx * 3.4, H / 2 + 0.5, 0);
    g.add(side);
  }
  for (const sx of [-1, 1]) {
    const front = box(2.5, H, 0.6, wallMat);
    front.position.set(sx * 2.45, H / 2 + 0.5, -3.1);
    g.add(front);
  }
  const lintel = box(2.6, 1.0, 0.7, darkStone());
  lintel.position.set(0, H + 0.0, -3.1);
  g.add(lintel);

  // stepped roof and a finial
  const roof = box(8.2, 0.5, 7.2, darkStone());
  roof.position.y = H + 0.75;
  g.add(roof);
  const roof2 = box(6.6, 0.5, 5.8, darkStone());
  roof2.position.y = H + 1.25;
  g.add(roof2);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.6, 4), darkStone());
  cap.rotation.y = Math.PI / 4;
  cap.position.y = H + 2.3;
  cap.castShadow = true;
  g.add(cap);

  // columns either side of the door
  for (const sx of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, H, 10), stone());
    col.position.set(sx * 1.5, H / 2 + 0.5, -3.5);
    col.castShadow = true;
    g.add(col);
  }

  // the dark of the doorway, and a pair of braziers
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.0),
    new THREE.MeshBasicMaterial({ color: '#0b0a0c' }));
  mouth.position.set(0, 2.0, -3.05);
  mouth.rotation.y = Math.PI;
  g.add(mouth);

  for (const sx of [-1, 1]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.18, 0.3, 8), darkStone());
    bowl.position.set(sx * 2.6, 1.5, -3.6);
    g.add(bowl);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.1, 8), darkStone());
    stem.position.set(sx * 2.6, 0.95, -3.6);
    g.add(stem);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 7),
      new THREE.MeshBasicMaterial({ color: '#ff8a3c' }));
    fire.position.set(sx * 2.6, 1.85, -3.6);
    g.add(fire);
    const light = new THREE.PointLight('#ff9a4a', 1.4, 9);
    light.position.set(sx * 2.6, 2.1, -3.6);
    g.add(light);
  }

  // gravestones scattered around
  let seed = 4242;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, r = 7 + rng() * 9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const st = box(0.5 + rng() * 0.3, 0.8 + rng() * 0.5, 0.16, darkStone());
    const wy = heightAt(MAUSOLEUM.x + x, MAUSOLEUM.z + z) - base;
    st.position.set(x, wy + 0.45, z);
    st.rotation.set((rng() - 0.5) * 0.2, rng() * 3, (rng() - 0.5) * 0.16);
    g.add(st);
  }

  // where the player stands to be offered the way down
  const door = new THREE.Vector3(MAUSOLEUM.x, 0, MAUSOLEUM.z - 4.6);
  return { group: g, door };
}

/* ------------------------------ the crypt ------------------------------ */
const O = DUNGEON_ORIGIN;

/** Rooms are axis-aligned boxes; the player is kept inside them. */
export const ROOMS = [
  { x: 0, z: 0, w: 18, d: 16, name: 'Forhallen' },
  { x: 0, z: -22, w: 8, d: 12, name: 'Gangen' },
  { x: 0, z: -40, w: 22, d: 20, name: 'Gravkammeret' },
  { x: -20, z: -8, w: 12, d: 10, name: 'Sidekammer' },
];

export function insideDungeon(x, z) {
  const lx = x - O.x, lz = z - O.z;
  for (const r of ROOMS) {
    if (lx > r.x - r.w / 2 && lx < r.x + r.w / 2 && lz > r.z - r.d / 2 && lz < r.z + r.d / 2) return r;
  }
  return null;
}

/** Push a point back inside the nearest room so you cannot walk through walls. */
export function clampToRooms(pos) {
  if (insideDungeon(pos.x, pos.z)) return;
  const lx = pos.x - O.x, lz = pos.z - O.z;
  let best = null, bestD = Infinity;
  for (const r of ROOMS) {
    const cx = THREE.MathUtils.clamp(lx, r.x - r.w / 2 + 0.6, r.x + r.w / 2 - 0.6);
    const cz = THREE.MathUtils.clamp(lz, r.z - r.d / 2 + 0.6, r.z + r.d / 2 - 0.6);
    const d = (cx - lx) ** 2 + (cz - lz) ** 2;
    if (d < bestD) { bestD = d; best = { cx, cz }; }
  }
  if (best) { pos.x = O.x + best.cx; pos.z = O.z + best.cz; }
}

function brazier(parent, x, z, lights) {
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.3, 8), darkStone());
  stem.position.set(x, 0.65, z);
  parent.add(stem);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.28, 8), darkStone());
  bowl.position.set(x, 1.4, z);
  parent.add(bowl);
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 7),
    new THREE.MeshBasicMaterial({ color: '#ff9a4a' }));
  fire.position.set(x, 1.8, z);
  parent.add(fire);
  const light = new THREE.PointLight('#ff9a4a', 3.4, 22, 1.2);
  light.position.set(x, 2.1, z);
  parent.add(light);
  lights.push({ light, fire, phase: Math.random() * 6.28 });
}

export function createDungeon() {
  const g = new THREE.Group();
  g.position.copy(O);
  const lights = [];

  // its own lighting: the overworld sun and sky are switched off down here
  g.add(new THREE.AmbientLight('#7d7690', 1.25));
  const hemi = new THREE.HemisphereLight('#8a82a0', '#332c26', 1.0);
  g.add(hemi);
  const fill = new THREE.DirectionalLight('#6d6480', 0.35);
  fill.position.set(4, 12, 6);
  fill.intensity = 0.5;
  g.add(fill);

  const floorMat = flat('#6e675e');
  const wallMat = flat('#5a544c');
  const trimMat = flat('#7d756a');
  const WALL_H = 5;

  for (const r of ROOMS) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.4, r.d), floorMat);
    floor.position.set(r.x, -0.2, r.z);
    floor.receiveShadow = true;
    g.add(floor);

    const ceil = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.4, r.d), wallMat);
    ceil.position.set(r.x, WALL_H, r.z);
    g.add(ceil);

    // walls, with gaps where rooms meet
    const mk = (w, d, x, z) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
      wall.position.set(x, WALL_H / 2, z);
      wall.receiveShadow = true;
      g.add(wall);
    };
    const gap = 4.4;
    // north / south walls, split around a doorway
    for (const side of [-1, 1]) {
      const z = r.z + side * (r.d / 2);
      const linked = ROOMS.some(o => o !== r && Math.abs(o.x - r.x) < 6
        && Math.sign(o.z - r.z) === side && Math.abs(o.z - r.z) < r.d / 2 + o.d / 2 + 1);
      if (linked) {
        const seg = (r.w - gap) / 2;
        mk(seg, 0.6, r.x - (gap + seg) / 2, z);
        mk(seg, 0.6, r.x + (gap + seg) / 2, z);
        const over = new THREE.Mesh(new THREE.BoxGeometry(gap, WALL_H - 3.2, 0.6), wallMat);
        over.position.set(r.x, WALL_H - (WALL_H - 3.2) / 2, z);
        g.add(over);
      } else {
        mk(r.w, 0.6, r.x, z);
      }
    }
    for (const side of [-1, 1]) {
      const x = r.x + side * (r.w / 2);
      const linked = ROOMS.some(o => o !== r && Math.abs(o.z - r.z) < 6
        && Math.sign(o.x - r.x) === side && Math.abs(o.x - r.x) < r.w / 2 + o.w / 2 + 1);
      if (linked) {
        const seg = (r.d - gap) / 2;
        mk(0.6, seg, x, r.z - (gap + seg) / 2);
        mk(0.6, seg, x, r.z + (gap + seg) / 2);
        const over = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_H - 3.2, gap), wallMat);
        over.position.set(x, WALL_H - (WALL_H - 3.2) / 2, r.z);
        g.add(over);
      } else {
        mk(0.6, r.d, x, r.z);
      }
    }

    // a little architecture so rooms are not bare boxes
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (r.w < 12 || r.d < 12) continue;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, WALL_H, 10), trimMat);
      col.position.set(r.x + sx * (r.w / 2 - 2.6), WALL_H / 2, r.z + sz * (r.d / 2 - 2.6));
      col.castShadow = true;
      g.add(col);
    }
  }

  // torches
  brazier(g, -6, 5, lights);
  brazier(g, 6, 5, lights);
  brazier(g, -3, -20, lights);
  brazier(g, 3, -26, lights);
  brazier(g, -8, -34, lights);
  brazier(g, 8, -34, lights);
  brazier(g, -8, -46, lights);
  brazier(g, 8, -46, lights);
  brazier(g, -20, -5, lights);

  // sarcophagi in the far chamber
  for (const sx of [-1, 1]) {
    const tomb = box(2.0, 0.9, 3.4, trimMat);
    tomb.position.set(sx * 6.5, 0.45, -42);
    g.add(tomb);
    const lid = box(2.2, 0.22, 3.6, darkStone());
    lid.position.set(sx * 6.5, 1.0, -42);
    g.add(lid);
  }

  // the steps back up, at the near wall of the entrance hall
  const stair = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const st = box(3.2, 0.3, 0.7, trimMat);
    st.position.set(0, 0.15 + i * 0.3, 6.4 + i * 0.7);
    stair.add(st);
  }
  g.add(stair);
  const arch = box(3.6, 0.6, 0.6, darkStone());
  arch.position.set(0, 3.4, 6.2);
  g.add(arch);

  const exitSpot = new THREE.Vector3(O.x, 0, O.z + 6.0);
  const spawnSpot = new THREE.Vector3(O.x, 0, O.z + 4.0);

  return {
    group: g,
    lights,
    exitSpot,
    spawnSpot,
    // where each kind waits for you
    posts: [
      { kind: 'brute', pos: new THREE.Vector3(O.x + 0, 0, O.z - 4) },
      { kind: 'archer', pos: new THREE.Vector3(O.x - 18, 0, O.z - 8) },
      { kind: 'guard', pos: new THREE.Vector3(O.x + 0, 0, O.z - 40) },
      { kind: 'archer', pos: new THREE.Vector3(O.x + 7, 0, O.z - 44) },
      { kind: 'brute', pos: new THREE.Vector3(O.x - 7, 0, O.z - 44) },
    ],
    update(dt, t) {
      for (const b of lights) {
        const f = 0.75 + Math.sin(t * 7 + b.phase) * 0.12 + Math.sin(t * 13 + b.phase) * 0.06;
        b.light.intensity = 3.4 * f;
        b.fire.scale.setScalar(0.9 + f * 0.2);
      }
    },
  };
}
