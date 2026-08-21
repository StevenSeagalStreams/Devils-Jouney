import * as THREE from 'three';
import { heightAt } from './world.js';

/* The mausoleum stands out in the meadow; below it is a maze of corridors that
   you have to actually explore. The layout is generated from a fixed seed, so
   it is the same crypt every run — learnable, and testable. */

export const MAUSOLEUM = { x: -26, z: -6 };
export const DUNGEON_ORIGIN = new THREE.Vector3(2000, 0, 2000);

export const MAZE = { w: 8, h: 8, cell: 8, wall: 0.7, height: 5 };

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
  lintel.position.set(0, H, -3.1);
  g.add(lintel);

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

  for (const sx of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, H, 10), stone());
    col.position.set(sx * 1.5, H / 2 + 0.5, -3.5);
    col.castShadow = true;
    g.add(col);
  }

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

  // step through this and you are underground — no key press
  const door = new THREE.Vector3(MAUSOLEUM.x, 0, MAUSOLEUM.z - 3.0);
  return { group: g, door };
}

/* ------------------------------ the maze ------------------------------ */
const O = DUNGEON_ORIGIN;
const HALF_W = (MAZE.w * MAZE.cell) / 2;
const HALF_H = (MAZE.h * MAZE.cell) / 2;

/** Centre of a cell, in world coordinates. */
export function cellCentre(cx, cz) {
  return new THREE.Vector3(
    O.x - HALF_W + cx * MAZE.cell + MAZE.cell / 2, 0,
    O.z - HALF_H + cz * MAZE.cell + MAZE.cell / 2);
}

/** Depth-first backtracker: a perfect maze, then a few walls knocked through
 *  so it has loops instead of being one long forced corridor. */
function generateMaze(seedValue) {
  let seed = seedValue;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const { w, h } = MAZE;
  const cells = [];
  for (let z = 0; z < h; z++) {
    cells[z] = [];
    for (let x = 0; x < w; x++) cells[z][x] = { n: true, e: true, s: true, w: true, visited: false };
  }
  const opposite = { n: 's', s: 'n', e: 'w', w: 'e' };
  const step = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

  const stack = [[0, h - 1]];
  cells[h - 1][0].visited = true;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const options = [];
    for (const dir of ['n', 'e', 's', 'w']) {
      const nx = cx + step[dir][0], nz = cz + step[dir][1];
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      if (!cells[nz][nx].visited) options.push([dir, nx, nz]);
    }
    if (!options.length) { stack.pop(); continue; }
    const [dir, nx, nz] = options[Math.floor(rng() * options.length)];
    cells[cz][cx][dir] = false;
    cells[nz][nx][opposite[dir]] = false;
    cells[nz][nx].visited = true;
    stack.push([nx, nz]);
  }

  // braid it: knock a handful of extra holes so there are alternative routes
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rng() * w), z = Math.floor(rng() * h);
    const dir = ['n', 'e', 's', 'w'][Math.floor(rng() * 4)];
    const nx = x + step[dir][0], nz = z + step[dir][1];
    if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
    cells[z][x][dir] = false;
    cells[nz][nx][opposite[dir]] = false;
  }

  // the stairs sit in cell (0, h-1); always open its north side so the way in
  // and out is a straight step rather than depending on the roll of the maze
  cells[MAZE.h - 1][0].n = false;
  cells[MAZE.h - 2][0].s = false;

  // two open chambers to fight in: clear the walls inside a 2x2 block
  const chambers = [[1, 1], [MAZE.w - 3, MAZE.h - 4]];
  for (const [bx, bz] of chambers) {
    for (let z = bz; z < bz + 2; z++) for (let x = bx; x < bx + 2; x++) {
      if (x + 1 < bx + 2) { cells[z][x].e = false; cells[z][x + 1].w = false; }
      if (z + 1 < bz + 2) { cells[z][x].s = false; cells[z + 1][x].n = false; }
    }
  }
  return { cells, chambers };
}

const { cells: CELLS, chambers: CHAMBERS } = generateMaze(1337);

/** Every wall as an axis-aligned box, for both building and collision. */
function wallBoxes() {
  const out = [];
  const { w, h, cell, wall } = MAZE;
  const add = (x0, z0, x1, z1) => out.push({
    minX: O.x - HALF_W + x0, maxX: O.x - HALF_W + x1,
    minZ: O.z - HALF_H + z0, maxZ: O.z - HALF_H + z1,
  });
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const c = CELLS[z][x];
      const left = x * cell, top = z * cell;
      if (c.n) add(left, top - wall / 2, left + cell, top + wall / 2);
      if (c.w) add(left - wall / 2, top, left + wall / 2, top + cell);
      if (z === h - 1 && c.s) add(left, top + cell - wall / 2, left + cell, top + cell + wall / 2);
      if (x === w - 1 && c.e) add(left + cell - wall / 2, top, left + cell + wall / 2, top + cell);
    }
  }
  return out;
}

const WALLS = wallBoxes();

/** Cheap broad-phase: only the walls whose box is near this point. */
function wallsNear(x, z, pad = 2) {
  return WALLS.filter(b => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
}

/** Push a position out of any wall it has entered. */
export function collideMaze(pos, radius = 0.45) {
  for (const b of wallsNear(pos.x, pos.z, radius + 0.6)) {
    const cx = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // dead centre of a wall: shove out along the shallowest axis
      const outLeft = pos.x - b.minX, outRight = b.maxX - pos.x;
      const outUp = pos.z - b.minZ, outDown = b.maxZ - pos.z;
      const m = Math.min(outLeft, outRight, outUp, outDown);
      if (m === outLeft) pos.x = b.minX - radius;
      else if (m === outRight) pos.x = b.maxX + radius;
      else if (m === outUp) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  // and inside the outer shell
  pos.x = THREE.MathUtils.clamp(pos.x, O.x - HALF_W + 0.6, O.x + HALF_W - 0.6);
  pos.z = THREE.MathUtils.clamp(pos.z, O.z - HALF_H + 0.6, O.z + HALF_H - 0.6);
}

/** Is this spot inside a wall? Used to keep the camera out of the stone. */
export function mazeBlocked(x, z, radius = 0.3) {
  for (const b of wallsNear(x, z, radius + 0.4)) {
    const cx = THREE.MathUtils.clamp(x, b.minX, b.maxX);
    const cz = THREE.MathUtils.clamp(z, b.minZ, b.maxZ);
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
  }
  return false;
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
  const light = new THREE.PointLight('#ff9a4a', 3.2, 20, 1.2);
  light.position.set(x, 2.1, z);
  parent.add(light);
  lights.push({ light, fire, phase: Math.random() * 6.28 });
}

/** Cells with exactly one way out — good places to hide something. */
function deadEnds() {
  const out = [];
  for (let z = 0; z < MAZE.h; z++) {
    for (let x = 0; x < MAZE.w; x++) {
      const c = CELLS[z][x];
      const open = ['n', 'e', 's', 'w'].filter(d => !c[d]).length;
      if (open === 1) out.push([x, z]);
    }
  }
  return out;
}

export function createDungeon() {
  const g = new THREE.Group();
  g.position.copy(O);
  const lights = [];

  g.add(new THREE.AmbientLight('#7d7690', 1.3));
  g.add(new THREE.HemisphereLight('#8a82a0', '#332c26', 0.9));
  const fill = new THREE.DirectionalLight('#6d6480', 0.45);
  fill.position.set(4, 12, 6);
  g.add(fill);

  const floorMat = flat('#6e675e');
  const wallMat = flat('#5a544c');
  const trimMat = flat('#7d756a');
  const W = MAZE.w * MAZE.cell, H = MAZE.h * MAZE.cell;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, H), floorMat);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  g.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, H), wallMat);
  ceil.position.set(0, MAZE.height, 0);
  g.add(ceil);

  // one mesh per wall segment, positioned from the same boxes collision uses
  for (const b of WALLS) {
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, MAZE.height, d), wallMat);
    wall.position.set((b.minX + b.maxX) / 2 - O.x, MAZE.height / 2, (b.minZ + b.maxZ) / 2 - O.z);
    wall.receiveShadow = true;
    wall.castShadow = true;
    g.add(wall);
  }

  // chambers get a pillar and a sarcophagus so they read as rooms
  for (const [bx, bz] of CHAMBERS) {
    const c = cellCentre(bx, bz);
    const lx = c.x - O.x + MAZE.cell / 2, lz = c.z - O.z + MAZE.cell / 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.48, MAZE.height, 10), trimMat);
    col.position.set(lx, MAZE.height / 2, lz);
    col.castShadow = true;
    g.add(col);
    const tomb = box(2.0, 0.9, 3.2, trimMat);
    tomb.position.set(lx - 2.6, 0.45, lz);
    g.add(tomb);
    const lid = box(2.2, 0.22, 3.4, darkStone());
    lid.position.set(lx - 2.6, 1.0, lz);
    g.add(lid);
    brazier(g, lx + 2.6, lz, lights);
  }

  // a torch in roughly every third cell, so corners stay readable
  for (let z = 0; z < MAZE.h; z++) {
    for (let x = 0; x < MAZE.w; x++) {
      if ((x * 3 + z * 5) % 3 !== 0) continue;
      const c = cellCentre(x, z);
      brazier(g, c.x - O.x, c.z - O.z, lights);
    }
  }

  // the way back up sits in the entrance cell
  const entrance = cellCentre(0, MAZE.h - 1);
  const stair = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const st = box(3.0, 0.3, 0.7, trimMat);
    st.position.set(entrance.x - O.x, 0.15 + i * 0.3, entrance.z - O.z + 2.0 + i * 0.7);
    stair.add(st);
  }
  g.add(stair);
  brazier(g, entrance.x - O.x - 2.2, entrance.z - O.z, lights);

  // monsters wait in dead ends and in the two chambers
  // fill the crypt: every dead end, then the cells furthest from the door
  const isEntrance = (x, z) => x === 0 && z === MAZE.h - 1;
  const ends = deadEnds().filter(([x, z]) => !isEntrance(x, z));
  const far = [];
  for (let z = 0; z < MAZE.h; z++) for (let x = 0; x < MAZE.w; x++) {
    if (isEntrance(x, z)) continue;
    if (ends.some(([ex, ez]) => ex === x && ez === z)) continue;
    far.push({ x, z, d: Math.hypot(x - 0, z - (MAZE.h - 1)) });
  }
  far.sort((a, b) => b.d - a.d);

  const posts = [];
  const rota = ['archer', 'brute', 'guard', 'brute', 'archer', 'guard', 'brute', 'archer'];
  const place = (x, z) => posts.push({ kind: rota[posts.length % rota.length], pos: cellCentre(x, z) });
  for (const [x, z] of ends) place(x, z);
  for (const c of far) {
    if (posts.length >= 9) break;
    // keep them spread out
    if (posts.some(p => p.pos.distanceTo(cellCentre(c.x, c.z)) < MAZE.cell * 1.9)) continue;
    place(c.x, c.z);
  }
  posts.push({ kind: 'guard', pos: cellCentre(CHAMBERS[1][0], CHAMBERS[1][1]) });
  posts.push({ kind: 'brute', pos: cellCentre(CHAMBERS[0][0] + 1, CHAMBERS[0][1] + 1) });

  const exitSpot = new THREE.Vector3(entrance.x, 0, entrance.z + 2.4);
  const spawnSpot = new THREE.Vector3(entrance.x, 0, entrance.z - 1.0);

  return {
    group: g,
    lights,
    exitSpot,
    spawnSpot,
    posts,
    cells: CELLS,
    deadEnds: ends,
    update(dt, t) {
      for (const b of lights) {
        const f = 0.75 + Math.sin(t * 7 + b.phase) * 0.12 + Math.sin(t * 13 + b.phase) * 0.06;
        b.light.intensity = 3.2 * f;
        b.fire.scale.setScalar(0.9 + f * 0.2);
      }
    },
  };
}
