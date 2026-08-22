/* Solid things you cannot walk through.
 *
 * Trees, rocks, cottages, market stalls and the mausoleum walls all live in
 * one list of simple shapes — a circle for anything round, an oriented box for
 * anything that is clearly a building. Both the hero and the creatures are
 * resolved against it, so nothing can be shoved through a wall either.
 *
 * The list is bucketed into a coarse grid, because a few hundred colliders
 * times a dozen creatures every frame is worth not doing the naive way.
 */

const CELL = 8;

/** A round obstacle: a tree trunk, a rock, a well. */
export const circle = (x, z, r) => ({ x, z, r });

/** A rectangular one, which may be turned: a cottage, a stall, a wall. */
export const boxAt = (x, z, hw, hd, yaw = 0) => ({ x, z, hw, hd, yaw });

/** The furthest a shape reaches from its centre, for bucketing. */
function reach(c) {
  return c.r !== undefined ? c.r : Math.hypot(c.hw, c.hd);
}

export function makeColliders(list = []) {
  const grid = new Map();
  const all = [];

  const key = (cx, cz) => `${cx},${cz}`;
  function add(c) {
    all.push(c);
    const e = reach(c);
    const x0 = Math.floor((c.x - e) / CELL), x1 = Math.floor((c.x + e) / CELL);
    const z0 = Math.floor((c.z - e) / CELL), z1 = Math.floor((c.z + e) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let bucket = grid.get(k);
        if (!bucket) grid.set(k, bucket = []);
        bucket.push(c);
      }
    }
  }
  for (const c of list) add(c);

  /** Every collider that could touch a circle at (x, z) of this radius. */
  function near(x, z, radius, out) {
    out.length = 0;
    const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL), z1 = Math.floor((z + radius) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const bucket = grid.get(key(cx, cz));
        if (!bucket) continue;
        for (const c of bucket) if (!out.includes(c)) out.push(c);
      }
    }
    return out;
  }

  /** How far, and which way, a circle at (x, z) has to move to get clear.
   *  Returns null when it is already clear. */
  function push(c, x, z, radius) {
    if (c.r !== undefined) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz), want = c.r + radius;
      if (d >= want) return null;
      if (d < 1e-4) return { x: want, z: 0 };               // dead centre: pick a side
      return { x: (dx / d) * (want - d), z: (dz / d) * (want - d) };
    }
    // oriented box: work in the box's own frame, then rotate the push back
    const cos = Math.cos(-c.yaw), sin = Math.sin(-c.yaw);
    const rx = (x - c.x) * cos - (z - c.z) * sin;
    const rz = (x - c.x) * sin + (z - c.z) * cos;
    const nx = Math.max(-c.hw, Math.min(c.hw, rx));
    const nz = Math.max(-c.hd, Math.min(c.hd, rz));
    let ox = rx - nx, oz = rz - nz;
    const d = Math.hypot(ox, oz);
    if (d >= radius) return null;
    if (d > 1e-4) {                                          // outside, but too close
      const s = (radius - d) / d;
      ox *= s; oz *= s;
    } else {                                                 // inside: leave by the near face
      const gapX = c.hw - Math.abs(rx), gapZ = c.hd - Math.abs(rz);
      if (gapX < gapZ) { ox = Math.sign(rx || 1) * (gapX + radius); oz = 0; }
      else { ox = 0; oz = Math.sign(rz || 1) * (gapZ + radius); }
    }
    const bc = Math.cos(c.yaw), bs = Math.sin(c.yaw);
    return { x: ox * bc - oz * bs, z: ox * bs + oz * bc };
  }

  const scratch = [];
  return {
    all,
    add,
    /** Move a position out of anything solid. Returns true if it had to. */
    resolve(pos, radius) {
      let moved = false;
      // a couple of passes, so being wedged between two things still ends well
      for (let pass = 0; pass < 3; pass++) {
        let hit = false;
        for (const c of near(pos.x, pos.z, radius + 1, scratch)) {
          const p = push(c, pos.x, pos.z, radius);
          if (!p) continue;
          pos.x += p.x; pos.z += p.z;
          hit = moved = true;
        }
        if (!hit) break;
      }
      return moved;
    },
    /** Is this spot inside something solid? */
    blocked(x, z, radius = 0) {
      for (const c of near(x, z, radius + 1, scratch)) {
        if (push(c, x, z, radius)) return true;
      }
      return false;
    },
  };
}
