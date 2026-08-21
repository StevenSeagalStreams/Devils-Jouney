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
  const bladeLen = 0.70 + t * 0.045;
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
  const grip = caps(0.04, 0.044, 0.21, flat(gripCols[t]), 6);
  grip.position.y = -0.02;
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
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.31, 0.38, 9, 1, true), leather);
  skirt.material.side = THREE.DoubleSide;
  skirt.position.y = -0.34;
  skirt.castShadow = true;
  torso.add(skirt);

  // head
  const neck = new THREE.Group();
  neck.position.y = 0.68;
  torso.add(neck);
  const head = sphere(0.168, skinM, 12);
  head.scale.set(0.92, 1.05, 0.95);
  head.position.y = 0.12;
  neck.add(head);
  const hair = sphere(0.172, hairM, 12);
  hair.scale.set(1.0, 0.82, 1.0);
  hair.position.set(0, 0.158, -0.045);
  neck.add(hair);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#2b1c12' });
  for (const sgn of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.021, 7, 7), eyeMat);
    eye.position.set(0.052 * sgn, 0.132, 0.158);
    neck.add(eye);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.02), new THREE.MeshBasicMaterial({ color: '#5d3a20' }));
  brow.position.set(0, 0.168, 0.156);
  neck.add(brow);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.02), new THREE.MeshBasicMaterial({ color: '#8d5340' }));
  mouth.position.set(0, 0.073, 0.158);
  neck.add(mouth);

  const crown = sphere(0.176, hairM, 12);
  crown.scale.set(1.0, 0.66, 1.0);
  crown.position.set(0, 0.2, -0.01);
  neck.add(crown);

  const braid = new THREE.Group();
  braid.position.set(0, 0.10, -0.15);
  neck.add(braid);
  for (let i = 0; i < 7; i++) {
    const s = sphere(0.06 - i * 0.0045, hairM, 8);
    s.position.set(0, -i * 0.085, -i * 0.008);
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
    const fist = sphere(0.085, skinM, 8);
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
    const thigh = caps(0.105, 0.092, 0.44, pants, 7);
    thigh.position.y = -0.24;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    hip.add(knee);
    const shin = caps(0.09, 0.078, 0.4, pants, 7);
    shin.position.y = -0.2;
    knee.add(shin);
    const boot = box(0.17, 0.15, 0.28, leatherDark);
    boot.position.set(0, -0.44, 0.04);
    knee.add(boot);
    return { hip, knee };
  }
  const legR = leg(-1);
  const legL = leg(1);

  // sword lives in the right hand
  const weaponMount = new THREE.Group();
  weaponMount.rotation.set(2.00, 1.10, 0.40);
  armR.hand.add(weaponMount);
  let weapon = createWeaponMesh(0);
  weaponMount.add(weapon);

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
    eye.position.set(0.075 * s, 0.0, 0.16);
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
    shoulder.position.set(0.31 * side, 0.28, 0);
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
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), flat('#e8e2d2'));
      c.position.set((i - 1) * 0.06, -0.08, 0.02);
      c.rotation.x = Math.PI;
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
    return { hip, knee };
  }
  const legR = leg(-1), legL = leg(1);

  root.userData = { body, lean, headPivot, armR, armL, legR, legL };
  return root;
}
