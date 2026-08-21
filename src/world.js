import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Deterministic value noise -> gentle rolling hills like the concept  *
 * ------------------------------------------------------------------ */
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = smooth(x - xi), zf = smooth(z - zi);
  const a = hash(xi, zi), b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return (a * (1 - xf) + b * xf) * (1 - zf) + (c * (1 - xf) + d * xf) * zf;
}

export const WORLD_SIZE = 260;

/** The safe town: level ground, no trees, and no monsters. */
export const TOWN = { x: 0, z: 30, radius: 13 };

function rawHeight(x, z) {
  const big = (valueNoise(x * 0.012, z * 0.012) - 0.5) * 9.0;
  const mid = (valueNoise(x * 0.045, z * 0.045) - 0.5) * 2.4;
  const fine = (valueNoise(x * 0.16, z * 0.16) - 0.5) * 0.35;
  // flatten the play area around the origin so combat never feels bumpy
  const d = Math.hypot(x, z);
  const flat = THREE.MathUtils.clamp((d - 10) / 24, 0, 1);
  return (big + mid) * flat + fine;
}

const TOWN_Y = rawHeight(TOWN.x, TOWN.z);

/** Distance from the town centre; < TOWN.radius means you are inside it. */
export function townDistance(x, z) {
  return Math.hypot(x - TOWN.x, z - TOWN.z);
}

/** Ground height at any point, levelled off across the town and its approach. */
export function heightAt(x, z) {
  const h = rawHeight(x, z);
  const t = THREE.MathUtils.clamp((townDistance(x, z) - TOWN.radius) / 9, 0, 1);
  return THREE.MathUtils.lerp(TOWN_Y, h, t * t * (3 - 2 * t));
}

export function groundNormal(x, z) {
  const e = 0.6;
  const hL = heightAt(x - e, z), hR = heightAt(x + e, z);
  const hD = heightAt(x, z - e), hU = heightAt(x, z + e);
  return new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
}

/* ------------------------------------------------------------------ */

function skyDome() {
  const geo = new THREE.SphereGeometry(600, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color('#6aa9e2') },
      mid: { value: new THREE.Color('#8dc5ef') },
      bot: { value: new THREE.Color('#dceefb') },
    },
    vertexShader: `varying vec3 vPos;
      void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      void main(){
        float h = normalize(vPos).y;
        vec3 c = mix(bot, mid, smoothstep(-0.05, 0.28, h));
        c = mix(c, top, smoothstep(0.05, 1.0, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  return m;
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const puff = (x, y, r) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.92)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  puff(96, 150, 62); puff(150, 140, 74); puff(196, 158, 52); puff(122, 118, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeClouds(rng) {
  const group = new THREE.Group();
  const tex = cloudTexture();
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  const count = 40;
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(mat.clone());
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const r = 200 + rng() * 170;
    const scale = 42 + rng() * 58;
    s.position.set(Math.cos(a) * r, 34 + rng() * 26, Math.sin(a) * r);
    s.scale.set(scale, scale * 0.55, 1);
    s.material.opacity = 0.65 + rng() * 0.3;
    s.userData.drift = 0.35 + rng() * 0.5;
    group.add(s);
  }
  group.userData.animate = (dt) => {
    for (const s of group.children) {
      s.position.x += s.userData.drift * dt;
      if (s.position.x > 460) s.position.x = -460;
    }
  };
  return group;
}

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const r = 4 + Math.random() * 14;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(232,244,220,0.09)' : 'rgba(172,198,132,0.06)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeTerrain() {
  const seg = 150;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE * 2.6, WORLD_SIZE * 2.6, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color('#8cc255');
  const cLush = new THREE.Color('#9ad463');
  const cDry = new THREE.Color('#b3cc66');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const t = valueNoise(x * 0.06 + 11, z * 0.06 + 7);
    tmp.copy(cGrass).lerp(t > 0.55 ? cLush : cDry, Math.abs(t - 0.5) * 1.3);
    // subtle sun-warmed tint on high ground
    tmp.offsetHSL(0, 0, THREE.MathUtils.clamp(pos.getY(i) * 0.012, -0.05, 0.05));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTexture() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function makeTree(rng) {
  const g = new THREE.Group();
  const trunkH = 2.6 + rng() * 1.4;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, trunkH, 7),
    new THREE.MeshLambertMaterial({ color: new THREE.Color('#6b4a2b').offsetHSL(0, 0, (rng() - 0.5) * 0.06) })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const leafCol = new THREE.Color('#4f9e35').offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.09);
  const leafMat = new THREE.MeshLambertMaterial({ color: leafCol, flatShading: true });
  const blobs = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < blobs; i++) {
    const r = 1.35 + rng() * 0.7 - i * 0.16;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
    b.position.set((rng() - 0.5) * 1.3, trunkH + 0.6 + i * 0.85, (rng() - 0.5) * 1.3);
    b.scale.y = 0.82 + rng() * 0.2;
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

function makeRock(rng) {
  const r = 0.16 + rng() * 0.22;
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(r, 0),
    new THREE.MeshLambertMaterial({ color: new THREE.Color('#a5a298').offsetHSL(0, 0, (rng() - 0.5) * 0.08), flatShading: true })
  );
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.scale.y = 0.6 + rng() * 0.3;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function makeDistantHills(rng) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#9dbcd6', fog: false });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng() * 0.1;
    const r = 430 + rng() * 80;
    const w = 110 + rng() * 150;
    const h = 30 + rng() * 26;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.clone());
    m.material.color = new THREE.Color('#a7c6de').offsetHSL(0, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.06);
    m.position.set(Math.cos(a) * r, -9, Math.sin(a) * r);
    m.scale.set(w, h, w * 0.7);
    g.add(m);
  }
  return g;
}

export function createWorld(scene) {
  let seed = 20260821;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  scene.background = new THREE.Color('#8dc5ef');
  scene.fog = new THREE.Fog('#c3e0f5', 150, 380);

  scene.add(skyDome());
  const clouds = makeClouds(rng);
  scene.add(clouds);
  scene.add(makeDistantHills(rng));
  scene.add(makeTerrain());

  // lighting: bright midday sun + sky bounce, matching the concept art
  const hemi = new THREE.HemisphereLight('#cfe7ff', '#5f8c3a', 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6df', 1.55);
  sun.position.set(34, 96, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  const S = 60;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));

  // props
  const props = new THREE.Group();
  const treeSpots = [];
  for (let i = 0; i < 95; i++) {
    const a = rng() * Math.PI * 2;
    const r = 24 + rng() * 150;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (townDistance(x, z) < TOWN.radius + 3) continue;
    const t = makeTree(rng);
    t.position.set(x, heightAt(x, z), z);
    const s = 0.68 + rng() * 0.42;
    t.scale.setScalar(s);
    t.rotation.y = rng() * Math.PI * 2;
    props.add(t);
    treeSpots.push({ x, z, r: 0.7 * s });
  }
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * 130;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (townDistance(x, z) < TOWN.radius + 2) continue;
    const rock = makeRock(rng);
    rock.position.set(x, heightAt(x, z) + 0.1, z);
    props.add(rock);
  }
  scene.add(props);

  return {
    sun,
    obstacles: treeSpots,
    update(dt) { clouds.userData.animate(dt); },
    followSun(target) {
      sun.position.set(target.x + 34, 96, target.z + 22);
      sun.target.position.copy(target);
      sun.target.updateMatrixWorld();
    },
  };
}
