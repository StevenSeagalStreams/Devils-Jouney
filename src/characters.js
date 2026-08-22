import * as THREE from 'three';

const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true, ...extra });

function box(w, h, d, mat, seg = 1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, seg, seg, seg), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function caps(rTop, rBot, h, mat, radial = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, radial), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function sphere(r, mat, seg = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------------ *
 *  Weapon meshes — tiers share a silhouette so gear reads at a glance  *
 * ------------------------------------------------------------------ */
export function createWeaponMesh(tier = 0) {
  const bladeCols = ['#cfd6dc', '#d8dee6', '#b9e2ee', '#c9b0f2', '#ffd479'];
  const gripCols = ['#5a3a20', '#5a3a20', '#3f4f63', '#43305e', '#6b4a12'];
  const guardCols = ['#8a8f95', '#c8a44a', '#9fd4e4', '#a879f0', '#ffcc55'];
  const t = Math.min(tier, 4);

  const g = new THREE.Group();
  const bladeLen = 0.52 + t * 0.04;
  const blade = box(0.095, bladeLen, 0.03, flat(bladeCols[t]));
  blade.position.y = bladeLen / 2 + 0.12;
  g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.19, 4), flat(bladeCols[t]));
  tip.rotation.y = Math.PI / 4;
  tip.position.y = bladeLen + 0.22;
  tip.castShadow = true;
  g.add(tip);
  const guard = box(0.22, 0.055, 0.08, flat(guardCols[t]));
  guard.position.y = 0.12;
  g.add(guard);
  const grip = caps(0.038, 0.042, 0.24, flat(gripCols[t]), 6);
  grip.position.y = -0.04;
  g.add(grip);
  const pommel = sphere(0.042, flat(guardCols[t]), 7);
  pommel.position.y = -0.135;
  g.add(pommel);
  if (t >= 3) {
    const glow = new THREE.PointLight(bladeCols[t], t >= 4 ? 1.1 : 0.6, 4);
    glow.position.y = bladeLen * 0.6;
    g.add(glow);
  }
  return g;
}

/* ------------------------------------------------------------------ *
 *  Player — brown leather armour, pauldrons, braid; sword in right hand *
 * ------------------------------------------------------------------ */
export function createPlayerModel() {
  const skinM = flat('#cf9a6d');
  const leather = flat('#6d4a2f');
  const leatherDark = flat('#4a3220');
  const cloth = flat('#3a3730');
  const pants = flat('#2f2c27');
  const hairM = flat('#7a4526');

  const root = new THREE.Group();

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);

  // torso
  const torso = new THREE.Group();
  hips.add(torso);
  const chest = box(0.40, 0.58, 0.27, leather);
  chest.position.y = 0.34;
  torso.add(chest);
  const belly = box(0.30, 0.26, 0.24, cloth);
  belly.position.y = -0.02;
  torso.add(belly);
  const belt = box(0.40, 0.11, 0.27, leatherDark);
  belt.position.y = -0.15;
  torso.add(belt);
  const buckle = box(0.1, 0.1, 0.06, flat('#c9a554'));
  buckle.position.set(0, -0.15, 0.15);
  torso.add(buckle);
  // skirt / tassets
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 0.30, 9, 1, true), leather);
  skirt.material.side = THREE.DoubleSide;
  skirt.position.y = -0.30;
  skirt.castShadow = true;
  torso.add(skirt);

  // head
  const neck = new THREE.Group();
  neck.position.y = 0.74;
  torso.add(neck);
  const throat = caps(0.062, 0.07, 0.10, skinM, 8);
  throat.position.y = -0.02;
  neck.add(throat);
  const head = sphere(0.168, skinM, 12);
  head.scale.set(0.92, 1.05, 0.95);
  head.position.y = 0.12;
  neck.add(head);
  const hair = sphere(0.172, hairM, 12);
  hair.scale.set(1.04, 0.95, 1.04);
  hair.position.set(0, 0.132, -0.05);
  neck.add(hair);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#2b1c12' });
  for (const sgn of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.021, 7, 7), eyeMat);
    eye.position.set(0.052 * sgn, 0.132, 0.148);
    neck.add(eye);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.02), new THREE.MeshBasicMaterial({ color: '#5d3a20' }));
  brow.position.set(0, 0.168, 0.148);
  neck.add(brow);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.02), new THREE.MeshBasicMaterial({ color: '#8d5340' }));
  mouth.position.set(0, 0.073, 0.145);
  neck.add(mouth);

  const crown = sphere(0.176, hairM, 12);
  crown.scale.set(1.0, 0.66, 1.0);
  crown.position.set(0, 0.2, -0.01);
  neck.add(crown);

  const braid = new THREE.Group();
  braid.position.set(0, 0.09, -0.20);
  neck.add(braid);
  for (let i = 0; i < 10; i++) {
    const s = sphere(0.06 - i * 0.0015, hairM, 8);
    s.position.set(0, -i * 0.055, 0);
    braid.add(s);
  }

  // shoulders / arms
  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.21 * side, 0.52, 0);
    torso.add(shoulder);
    const pauldron = sphere(0.115, leather, 9);
    pauldron.scale.set(1.15, 0.85, 1.05);
    shoulder.add(pauldron);
    const upper = caps(0.085, 0.075, 0.34, skinM, 7);
    upper.position.y = -0.24;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.42;
    shoulder.add(elbow);
    const fore = caps(0.078, 0.072, 0.32, leatherDark, 7);
    fore.position.y = -0.18;
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -0.37;
    elbow.add(hand);
    const fist = sphere(0.072, skinM, 8);
    hand.add(fist);
    return { shoulder, elbow, hand };
  }
  const armR = arm(-1);   // sword arm (model's right: -X when facing +Z)
  const armL = arm(1);

  // legs
  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.115 * side, -0.16, 0);
    hips.add(hip);
    const thigh = caps(0.105, 0.092, 0.40, pants, 7);
    thigh.position.y = -0.20;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.40;
    hip.add(knee);
    const shin = caps(0.09, 0.078, 0.30, pants, 7);
    shin.position.y = -0.15;
    knee.add(shin);
    const boot = box(0.17, 0.14, 0.28, leatherDark);
    boot.position.set(0, -0.272, 0.04);
    knee.add(boot);
    return { hip, knee, boot, bootHalf: 0.07 };
  }
  const legR = leg(-1);
  const legL = leg(1);

  // sword lives in the right hand
  const weaponMount = new THREE.Group();
  weaponMount.rotation.set(2.00, 1.10, 0.40);
  armR.hand.add(weaponMount);
  let weapon = createWeaponMesh(0);
  weaponMount.add(weapon);

  root.scale.setScalar(0.91);   // brings the rig to ~1.8m tall

  root.userData = {
    hips, torso, neck, armR, armL, legR, legL, weaponMount,
    setWeaponTier(tier) {
      weaponMount.remove(weapon);
      weapon.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      weapon = createWeaponMesh(tier);
      weaponMount.add(weapon);
    },
  };
  return root;
}

/* ------------------------------------------------------------------ *
 *  Monster — hunched clawed brute, matching the concept silhouette      *
 * ------------------------------------------------------------------ */
export function createMonsterModel(variant = 0) {
  const palettes = [
    { skin: '#9d6b46', dark: '#6f4526', eye: '#ffe06a' },
    { skin: '#7d8f5a', dark: '#55603a', eye: '#c8ff6a' },
    { skin: '#8b5a5a', dark: '#5e3838', eye: '#ff8a5a' },
  ];
  const p = palettes[variant % palettes.length];
  const skin = flat(p.skin);
  const dark = flat(p.dark);

  const root = new THREE.Group();
  // body sits low so the whole thing stands about 1.55m — shorter than the hero
  const body = new THREE.Group();
  body.position.y = 0.98;
  root.add(body);

  // everything above the hips leans forward; the legs stay under it
  const lean = new THREE.Group();
  lean.rotation.x = 0.30;
  body.add(lean);

  const torso = box(0.5, 0.6, 0.42, skin);
  torso.position.y = 0.12;
  lean.add(torso);
  const hipBox = box(0.44, 0.28, 0.38, dark);
  hipBox.position.y = -0.2;
  body.add(hipBox);

  const neckCol = caps(0.09, 0.11, 0.12, dark, 7);
  neckCol.position.set(0, 0.44, 0.04);
  lean.add(neckCol);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.56, 0.06);
  lean.add(headPivot);
  const head = box(0.3, 0.28, 0.32, skin);
  headPivot.add(head);
  const brow = box(0.32, 0.08, 0.06, dark);
  brow.position.set(0, 0.06, 0.15);
  headPivot.add(brow);
  const jaw = box(0.22, 0.11, 0.22, dark);
  jaw.position.set(0, -0.16, 0.07);
  headPivot.add(jaw);
  for (const s of [-1, 1]) {
    const eye = sphere(0.032, new THREE.MeshBasicMaterial({ color: p.eye }), 7);
    eye.position.set(0.075 * s, 0.0, 0.145);
    headPivot.add(eye);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 5), dark);
    horn.position.set(0.1 * s, 0.16, -0.04);
    horn.rotation.set(-0.5, 0, -0.2 * s);   // swept back, not splayed out
    horn.castShadow = true;
    headPivot.add(horn);
  }

  // long arms hanging low; the segments meet cleanly at the elbow
  function limb(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.38 * side, 0.28, 0);
    lean.add(shoulder);
    const upper = caps(0.12, 0.1, 0.44, skin, 7);
    upper.position.y = -0.22;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.44;
    shoulder.add(elbow);
    const fore = caps(0.1, 0.09, 0.4, dark, 7);
    fore.position.y = -0.2;
    elbow.add(fore);
    const claw = new THREE.Group();
    claw.position.y = -0.4;
    elbow.add(claw);
    const palm = sphere(0.095, dark, 8);
    palm.scale.set(1.0, 0.8, 0.9);
    claw.add(palm);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), flat('#e8e2d2'));
      c.position.set((i - 1) * 0.062, -0.11, 0.05 - Math.abs(i - 1) * 0.06);
      c.rotation.set(Math.PI, 0, (i - 1) * 0.16);
      c.castShadow = true;
      claw.add(c);
    }
    return { shoulder, elbow, claw };
  }
  const armR = limb(-1), armL = limb(1);

  // legs: short and stocky, feet flat on the ground
  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.16 * side, -0.3, 0);
    body.add(hip);
    const thigh = caps(0.13, 0.11, 0.32, skin, 7);
    thigh.position.y = -0.16;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.32;
    hip.add(knee);
    const shin = caps(0.1, 0.085, 0.28, dark, 7);
    shin.position.y = -0.14;
    knee.add(shin);
    const foot = box(0.2, 0.12, 0.3, dark);
    foot.position.set(0, -0.3, 0.05);
    knee.add(foot);
    return { hip, knee, foot, footHalf: 0.06 };
  }
  const legR = leg(-1), legL = leg(1);

  root.userData = { body, lean, headPivot, armR, armL, legR, legL };
  return root;
}

/* ------------------------------------------------------------------ *
 *  Townsfolk — a robed figure; colour tells the two trades apart       *
 * ------------------------------------------------------------------ */
export function createNpcModel(kind = 'healer') {
  const look = kind === 'healer'
    ? { robe: '#3f8f57', trim: '#eae2c8', hair: '#6b5a3a', skin: '#d8a87c' }
    : { robe: '#8d6a2a', trim: '#e8c96a', hair: '#3a2a1c', skin: '#c99a6d' };

  const root = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.52, 1.16, 10), flat(look.robe));
  robe.position.y = 0.58;
  robe.castShadow = true;
  robe.receiveShadow = true;
  root.add(robe);

  const chest = box(0.46, 0.34, 0.30, flat(look.robe));
  chest.position.y = 1.3;
  root.add(chest);
  const sash = box(0.5, 0.1, 0.33, flat(look.trim));
  sash.position.y = 1.16;
  root.add(sash);

  for (const sgn of [-1, 1]) {
    const arm = caps(0.075, 0.07, 0.5, flat(look.robe), 7);
    arm.position.set(sgn * 0.28, 1.2, 0.02);
    arm.rotation.z = sgn * 0.16;
    root.add(arm);
    const hand = sphere(0.062, flat(look.skin), 7);
    hand.position.set(sgn * 0.33, 0.95, 0.03);
    root.add(hand);
  }

  const head = sphere(0.165, flat(look.skin), 12);
  head.scale.set(0.94, 1.04, 0.96);
  head.position.y = 1.62;
  root.add(head);
  const hair = sphere(0.172, flat(look.hair), 12);
  hair.scale.set(1.0, 0.72, 1.0);
  hair.position.y = 1.68;
  root.add(hair);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#2b1c12' });
  for (const sgn of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 7, 7), eyeMat);
    eye.position.set(0.05 * sgn, 1.62, 0.145);
    root.add(eye);
  }

  if (kind === 'healer') {
    // a plain green cross on a staff, so the trade reads at a glance
    const staff = caps(0.035, 0.035, 1.7, flat('#6b4a2b'), 6);
    staff.position.set(0.42, 0.85, 0.05);
    root.add(staff);
    const cross = new THREE.Group();
    cross.position.set(0.42, 1.75, 0.05);
    const barA = box(0.34, 0.11, 0.08, flat('#5fd35f'));
    const barB = box(0.11, 0.34, 0.08, flat('#5fd35f'));
    cross.add(barA, barB);
    root.add(cross);
  } else {
    const pouch = sphere(0.13, flat('#5d3d24'), 8);
    pouch.scale.set(1, 0.85, 0.7);
    pouch.position.set(-0.3, 1.02, 0.16);
    root.add(pouch);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12), flat('#e8c96a'));
    coin.rotation.x = Math.PI / 2;
    coin.position.set(0.36, 1.12, 0.16);
    root.add(coin);
  }

  root.userData = { kind, bob: Math.random() * Math.PI * 2 };
  return root;
}

/* ------------------------------------------------------------------ *
 *  Wildlife and dungeon dwellers                                       *
 * ------------------------------------------------------------------ */

/** Boar: harmless until you hit it, then it gores you. */
export function createBoarModel() {
  const hide = flat('#6b4a33');
  const dark = flat('#4a3120');
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.62;
  root.add(body);

  const trunk = box(0.62, 0.56, 1.06, hide);
  body.add(trunk);
  const rump = box(0.5, 0.46, 0.3, dark);
  rump.position.set(0, -0.02, -0.6);
  body.add(rump);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, -0.02, 0.58);
  body.add(headPivot);
  const head = box(0.42, 0.4, 0.44, hide);
  headPivot.add(head);
  const snout = box(0.24, 0.2, 0.24, dark);
  snout.position.set(0, -0.08, 0.3);
  headPivot.add(snout);
  for (const sgn of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 5), flat('#e8e2d2'));
    tusk.position.set(0.1 * sgn, -0.04, 0.36);
    tusk.rotation.set(-0.5, 0, 0.2 * sgn);
    tusk.castShadow = true;
    headPivot.add(tusk);
    const ear = box(0.1, 0.16, 0.06, dark);
    ear.position.set(0.17 * sgn, 0.2, 0.02);
    headPivot.add(ear);
    const eye = sphere(0.032, new THREE.MeshBasicMaterial({ color: '#2b1c12' }), 7);
    eye.position.set(0.13 * sgn, 0.06, 0.21);
    headPivot.add(eye);
  }
  // bristles along the spine
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), dark);
    b.position.set(0, 0.32, 0.3 - i * 0.18);
    b.castShadow = true;
    body.add(b);
  }

  function leg(sx, sz) {
    const hip = new THREE.Group();
    hip.position.set(0.24 * sx, -0.24, 0.34 * sz);
    body.add(hip);
    const upper = caps(0.085, 0.07, 0.32, hide, 6);
    upper.position.y = -0.16;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -0.3;
    hip.add(knee);
    const hoof = box(0.14, 0.14, 0.16, dark);
    hoof.position.y = -0.07;
    knee.add(hoof);
    return { hip, knee, foot: hoof, footHalf: 0.07 };
  }
  const legR = leg(-1, 1), legL = leg(1, 1);
  const backR = leg(-1, -1), backL = leg(1, -1);

  root.userData = { body, lean: body, headPivot, legR, legL, backR, backL, armR: null, armL: null };
  return root;
}

/** Skeleton archer: keeps its distance and looses arrows. */
export function createArcherModel() {
  const bone = flat('#ded6c2');
  const dark = flat('#6b6250');
  const cloth = flat('#4a3b58');
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.92;
  root.add(body);
  const lean = new THREE.Group();
  body.add(lean);

  const ribs = box(0.36, 0.5, 0.24, bone);
  ribs.position.y = 0.16;
  lean.add(ribs);
  for (let i = 0; i < 3; i++) {
    const r = box(0.42, 0.05, 0.28, dark);
    r.position.y = 0.3 - i * 0.13;
    lean.add(r);
  }
  const hipBox = box(0.32, 0.2, 0.22, bone);
  hipBox.position.y = -0.2;
  body.add(hipBox);
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.6, 8, 1, true), cloth);
  cape.material.side = THREE.DoubleSide;
  cape.position.set(0, 0.02, -0.1);
  cape.castShadow = true;
  lean.add(cape);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.52, 0);
  lean.add(headPivot);
  const skull = box(0.26, 0.26, 0.26, bone);
  headPivot.add(skull);
  const jaw = box(0.2, 0.08, 0.2, dark);
  jaw.position.set(0, -0.16, 0.02);
  headPivot.add(jaw);
  for (const sgn of [-1, 1]) {
    const eye = sphere(0.036, new THREE.MeshBasicMaterial({ color: '#8ef0ff' }), 7);
    eye.position.set(0.06 * sgn, 0.02, 0.13);
    headPivot.add(eye);
  }

  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.24 * side, 0.32, 0);
    lean.add(shoulder);
    const upper = caps(0.055, 0.05, 0.34, bone, 6);
    upper.position.y = -0.17;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);
    const fore = caps(0.05, 0.045, 0.32, bone, 6);
    fore.position.y = -0.16;
    elbow.add(fore);
    const claw = new THREE.Group();
    claw.position.y = -0.33;
    elbow.add(claw);
    return { shoulder, elbow, claw };
  }
  const armR = arm(-1), armL = arm(1);

  // the bow rides in the off hand
  const bow = new THREE.Group();
  const limbMat = flat('#7a5433');
  for (const sgn of [-1, 1]) {
    const limb = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 5, 10, Math.PI * 0.55), limbMat);
    limb.rotation.set(Math.PI / 2, 0, sgn > 0 ? -0.5 : Math.PI + 0.5);
    limb.castShadow = true;
    bow.add(limb);
  }
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.66, 4), flat('#e8e2d2'));
  bow.add(string);
  bow.position.set(0, -0.06, 0.1);
  bow.rotation.z = Math.PI / 2;
  armL.claw.add(bow);

  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.12 * side, -0.28, 0);
    body.add(hip);
    const thigh = caps(0.065, 0.055, 0.34, bone, 6);
    thigh.position.y = -0.17;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.34;
    hip.add(knee);
    const shin = caps(0.055, 0.05, 0.3, bone, 6);
    shin.position.y = -0.15;
    knee.add(shin);
    const foot = box(0.14, 0.09, 0.24, dark);
    foot.position.set(0, -0.32, 0.05);
    knee.add(foot);
    return { hip, knee, foot, footHalf: 0.045 };
  }
  const legR = leg(-1), legL = leg(1);

  root.userData = { body, lean, headPivot, armR, armL, legR, legL, bow };
  return root;
}

/** Shield guard: a slab of a thing that blocks whatever it faces. */
export function createGuardModel() {
  const plate = flat('#6f7681');
  const dark = flat('#464c55');
  const trim = flat('#a8794a');
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.02;
  root.add(body);
  const lean = new THREE.Group();
  lean.rotation.x = 0.12;
  body.add(lean);

  const torso = box(0.66, 0.66, 0.46, plate);
  torso.position.y = 0.14;
  lean.add(torso);
  const belt = box(0.7, 0.12, 0.5, trim);
  belt.position.y = -0.18;
  lean.add(belt);
  const hipBox = box(0.56, 0.28, 0.42, dark);
  hipBox.position.y = -0.32;
  body.add(hipBox);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.56, 0.02);
  lean.add(headPivot);
  const helm = box(0.34, 0.34, 0.36, plate);
  headPivot.add(helm);
  const crest = box(0.08, 0.14, 0.4, trim);
  crest.position.y = 0.22;
  headPivot.add(crest);
  const visor = box(0.3, 0.08, 0.06, dark);
  visor.position.set(0, 0.0, 0.18);
  headPivot.add(visor);
  for (const sgn of [-1, 1]) {
    const eye = sphere(0.028, new THREE.MeshBasicMaterial({ color: '#ff6a3c' }), 7);
    eye.position.set(0.07 * sgn, 0.0, 0.2);
    headPivot.add(eye);
  }

  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.4 * side, 0.3, 0);
    lean.add(shoulder);
    const pauldron = sphere(0.19, plate, 8);
    pauldron.scale.set(1.1, 0.85, 1.05);
    shoulder.add(pauldron);
    const upper = caps(0.11, 0.1, 0.36, dark, 7);
    upper.position.y = -0.22;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.4;
    shoulder.add(elbow);
    const fore = caps(0.1, 0.09, 0.34, plate, 7);
    fore.position.y = -0.17;
    elbow.add(fore);
    const claw = new THREE.Group();
    claw.position.y = -0.36;
    elbow.add(claw);
    return { shoulder, elbow, claw };
  }
  const armR = arm(-1), armL = arm(1);

  // a big slab shield on the off arm, held across the front
  const shield = new THREE.Group();
  const face = box(0.86, 1.12, 0.12, plate);
  shield.add(face);
  const boss = sphere(0.16, trim, 9);
  boss.scale.set(1, 1, 0.6);
  boss.position.z = 0.1;
  shield.add(boss);
  const edge = box(0.94, 0.1, 0.16, trim);
  edge.position.y = 0.56;
  shield.add(edge);
  const edge2 = box(0.94, 0.1, 0.16, trim);
  edge2.position.y = -0.56;
  shield.add(edge2);
  shield.position.set(0.16, -0.2, 0.34);
  shield.rotation.set(0.1, 0.25, 0);
  armL.claw.add(shield);

  const mace = new THREE.Group();
  const haft = caps(0.05, 0.05, 0.7, flat('#5d3d24'), 6);
  haft.position.y = -0.3;
  mace.add(haft);
  const headBall = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), dark);
  headBall.position.y = -0.68;
  headBall.castShadow = true;
  mace.add(headBall);
  mace.rotation.x = 0.2;
  armR.claw.add(mace);

  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.2 * side, -0.38, 0);
    body.add(hip);
    const thigh = caps(0.14, 0.12, 0.36, dark, 7);
    thigh.position.y = -0.18;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.36;
    hip.add(knee);
    const shin = caps(0.12, 0.1, 0.32, plate, 7);
    shin.position.y = -0.16;
    knee.add(shin);
    const foot = box(0.24, 0.14, 0.34, dark);
    foot.position.set(0, -0.3, 0.06);
    knee.add(foot);
    return { hip, knee, foot, footHalf: 0.07 };
  }
  const legR = leg(-1), legL = leg(1);

  root.userData = { body, lean, headPivot, armR, armL, legR, legL, shield };
  return root;
}

/** The crypt lord: big, horned, and carrying a whip. */
export function createBossModel() {
  const hide = flat('#7a2f2a');
  const dark = flat('#4a1c1a');
  const bone = flat('#e0d6c2');
  const metal = flat('#57524a');

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.5;
  root.add(body);
  const lean = new THREE.Group();
  lean.rotation.x = 0.14;
  body.add(lean);

  const torso = box(1.15, 1.05, 0.75, hide);
  torso.position.y = 0.2;
  lean.add(torso);
  const plate = box(1.2, 0.45, 0.8, metal);
  plate.position.y = 0.5;
  lean.add(plate);
  const hipBox = box(0.95, 0.45, 0.7, dark);
  hipBox.position.y = -0.45;
  body.add(hipBox);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.95, 0.08);
  lean.add(headPivot);
  const head = box(0.55, 0.5, 0.58, hide);
  headPivot.add(head);
  const jaw = box(0.42, 0.16, 0.4, dark);
  jaw.position.set(0, -0.3, 0.1);
  headPivot.add(jaw);
  for (const sgn of [-1, 1]) {
    const eye = sphere(0.06, new THREE.MeshBasicMaterial({ color: '#ffe23c' }), 8);
    eye.position.set(0.14 * sgn, 0.04, 0.29);
    headPivot.add(eye);
    // long swept horns
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.ConeGeometry(0.11 - i * 0.03, 0.3, 6), bone);
      seg.position.set(0.24 * sgn + i * 0.07 * sgn, 0.3 + i * 0.22, -0.1 - i * 0.12);
      seg.rotation.set(-0.5 - i * 0.2, 0, -0.4 * sgn);
      seg.castShadow = true;
      headPivot.add(seg);
    }
  }

  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.7 * side, 0.5, 0);
    lean.add(shoulder);
    const pauldron = sphere(0.3, metal, 9);
    pauldron.scale.set(1.1, 0.85, 1.05);
    shoulder.add(pauldron);
    const upper = caps(0.19, 0.16, 0.6, hide, 8);
    upper.position.y = -0.35;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.66;
    shoulder.add(elbow);
    const fore = caps(0.16, 0.14, 0.55, dark, 8);
    fore.position.y = -0.28;
    elbow.add(fore);
    const claw = new THREE.Group();
    claw.position.y = -0.58;
    elbow.add(claw);
    const fist = sphere(0.17, dark, 8);
    claw.add(fist);
    return { shoulder, elbow, claw };
  }
  const armR = arm(-1), armL = arm(1);

  // the whip: a chain of shrinking segments hanging from the main hand
  const whip = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.07 - i * 0.005, 0.065 - i * 0.005, 0.34, 6), dark);
    seg.position.y = -0.18 - i * 0.32;
    seg.rotation.z = Math.sin(i * 1.3) * 0.16;
    whip.add(seg);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 5), bone);
  tip.position.y = -0.18 - 9 * 0.32;
  whip.add(tip);
  armR.claw.add(whip);

  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.34 * side, -0.55, 0);
    body.add(hip);
    const thigh = caps(0.24, 0.2, 0.58, hide, 8);
    thigh.position.y = -0.29;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.58;
    hip.add(knee);
    const shin = caps(0.2, 0.17, 0.5, dark, 8);
    shin.position.y = -0.25;
    knee.add(shin);
    const foot = box(0.38, 0.2, 0.55, dark);
    foot.position.set(0, -0.5, 0.1);
    knee.add(foot);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), bone);
      c.position.set((i - 1) * 0.1, -0.56, 0.34);
      c.rotation.x = Math.PI * 0.62;
      knee.add(c);
    }
    return { hip, knee, foot, footHalf: 0.1 };
  }
  const legR = leg(-1), legL = leg(1);

  root.userData = { body, lean, headPivot, armR, armL, legR, legL, whip };
  return root;
}
