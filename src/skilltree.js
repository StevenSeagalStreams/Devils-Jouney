/* The skill tree.
 *
 * Three branches, fifteen nodes, five ranks each — seventy-five points to fill
 * it all, and thirty to spend at most, so a build is a set of choices rather
 * than a checklist.
 *
 * Two things make a point worth spending:
 *   ranks     — each rank in a skill makes that skill stronger, and
 *   synergies — ranks in a related skill quietly feed another one.
 *
 * The synergy idea is borrowed from the old action-RPGs: a skill you never
 * press can still be the reason your finisher hits hard. The numbers below are
 * chosen so a fresh character is modest, a mid character is comfortable, and
 * only a level-30 character with a finished branch is frightening.
 */

export const MAX_LEVEL = 30;
export const POINTS_PER_LEVEL = 1;

export const BRANCHES = [
  { id: 'klinge', name: 'Klinge', blurb: 'Sværdet, og hvad du kan gøre med det.', color: '#ff8a5a' },
  { id: 'jagt', name: 'Jagt', blurb: 'Fart, ild og raseri.', color: '#ffd479' },
  { id: 'vogter', name: 'Vogter', blurb: 'At blive stående, når andre falder.', color: '#7ce8b0' },
];

/* Rank scaling: rank 1 is the printed value, every rank after adds RANK_STEP
   of it, so five ranks is about +72% on its own. The rest has to come from
   synergies, which is what makes a finished branch worth more than five
   scattered points. */
export const RANK_STEP = 0.18;

export const NODES = [
  /* ---------------------------- Klinge ---------------------------- */
  {
    id: 'hug', name: 'Hug', branch: 'klinge', tier: 1, kind: 'active',
    ability: 'hug', maxRank: 5, reqLevel: 1, requires: [],
    text: 'Et hårdt hug på den, der står foran dig.',
    synergies: [{ id: 'skarp', per: 0.045 }],
  },
  {
    id: 'skarp', name: 'Skarpslebet', branch: 'klinge', tier: 1, kind: 'passive',
    maxRank: 5, reqLevel: 1, requires: [],
    grants: { weaponDamage: 0.04 },
    text: 'Du holder æggen skarp: +4% våbenskade pr. rang.',
  },
  {
    id: 'blodtorst', name: 'Blodtørst', branch: 'klinge', tier: 2, kind: 'passive',
    maxRank: 5, reqLevel: 6, requires: ['hug'],
    grants: { lifesteal: 0.012 },
    text: 'Du suger liv af dine slag: 1,2% af skaden pr. rang.',
  },
  {
    id: 'hvirvelvind', name: 'Hvirvelvind', branch: 'klinge', tier: 2, kind: 'active',
    ability: 'hvirvelvind', maxRank: 5, reqLevel: 6, requires: ['hug'],
    text: 'Snurrer rundt og rammer alt omkring dig.',
    synergies: [{ id: 'hug', per: 0.05 }, { id: 'skarp', per: 0.035 }],
  },
  {
    id: 'dommedag', name: 'Dommedag', branch: 'klinge', tier: 3, kind: 'active',
    ability: 'dommedag', maxRank: 5, reqLevel: 18, requires: ['hvirvelvind'],
    text: 'Slår jorden itu omkring dig.',
    synergies: [{ id: 'hvirvelvind', per: 0.06 }, { id: 'hug', per: 0.04 }, { id: 'blodtorst', per: 0.03 }],
  },

  /* ----------------------------- Jagt ----------------------------- */
  {
    id: 'stormlob', name: 'Stormløb', branch: 'jagt', tier: 1, kind: 'active',
    ability: 'stormlob', maxRank: 5, reqLevel: 1, requires: [],
    text: 'Styrter frem og skubber alt til side.',
    synergies: [{ id: 'fodfaeste', per: 0.05 }],
  },
  {
    id: 'fodfaeste', name: 'Fodfæste', branch: 'jagt', tier: 1, kind: 'passive',
    maxRank: 5, reqLevel: 1, requires: [],
    grants: { moveSpeed: 0.025, attackSpeed: 0.02 },
    text: 'Lettere på fødderne: +2,5% fart og +2% angrebstempo pr. rang.',
  },
  {
    id: 'praecision', name: 'Præcision', branch: 'jagt', tier: 2, kind: 'passive',
    maxRank: 5, reqLevel: 6, requires: ['fodfaeste'],
    grants: { crit: 0.025 },
    text: 'Du finder hullerne i forsvaret: +2,5% kritisk chance pr. rang.',
  },
  {
    id: 'ildstod', name: 'Ildstød', branch: 'jagt', tier: 2, kind: 'active',
    ability: 'ildstod', maxRank: 5, reqLevel: 6, requires: ['stormlob'],
    text: 'Sender ild mod en fjende på afstand.',
    synergies: [{ id: 'stormlob', per: 0.06 }, { id: 'praecision', per: 0.04 }],
  },
  {
    id: 'kampraseri', name: 'Kampraseri', branch: 'jagt', tier: 3, kind: 'active',
    ability: 'kampraseri', maxRank: 5, reqLevel: 12, requires: ['ildstod'],
    text: 'Du går bersærk og slår hårdere et stykke tid.',
    synergies: [{ id: 'fodfaeste', per: 0.05 }, { id: 'ildstod', per: 0.035 }],
  },

  /* ---------------------------- Vogter ---------------------------- */
  {
    id: 'forbinding', name: 'Forbinding', branch: 'vogter', tier: 1, kind: 'active',
    ability: 'forbinding', maxRank: 5, reqLevel: 1, requires: [],
    text: 'Binder dine sår midt i kampen.',
    synergies: [{ id: 'haerdet', per: 0.05 }],
  },
  {
    id: 'haerdet', name: 'Hærdet', branch: 'vogter', tier: 1, kind: 'passive',
    maxRank: 5, reqLevel: 1, requires: [],
    grants: { maxLife: 0.045 },
    text: 'Sejt kød og gamle ar: +4,5% liv pr. rang.',
  },
  {
    id: 'gengaeld', name: 'Gengæld', branch: 'vogter', tier: 2, kind: 'passive',
    maxRank: 5, reqLevel: 6, requires: ['haerdet'],
    grants: { weaponDamage: 0.03 },
    text: 'Du slår igen, hårdere: +3% våbenskade pr. rang.',
  },
  {
    id: 'stenhud', name: 'Stenhud', branch: 'vogter', tier: 2, kind: 'active',
    ability: 'stenhud', maxRank: 5, reqLevel: 6, requires: ['haerdet'],
    text: 'Din hud bliver til sten et stykke tid.',
    synergies: [{ id: 'haerdet', per: 0.055 }],
  },
  {
    id: 'livskraft', name: 'Livskraft', branch: 'vogter', tier: 3, kind: 'passive',
    maxRank: 5, reqLevel: 12, requires: ['forbinding', 'stenhud'],
    grants: { healing: 0.08, regen: 0.35 },
    text: 'Kroppen læger sig selv: +8% helbredelse og +0,35 liv i sekundet pr. rang.',
  },
];

export const NODE_BY_ID = Object.fromEntries(NODES.map(n => [n.id, n]));

/* ------------------------------ rules ------------------------------ */

/** One point per level, and one to start with, so level 1 already has a choice. */
export function pointsForLevel(level) {
  return Math.max(0, Math.min(level, MAX_LEVEL)) * POINTS_PER_LEVEL;
}

export function spentPoints(ranks) {
  return Object.values(ranks).reduce((a, b) => a + b, 0);
}

export function pointsLeft(level, ranks) {
  return pointsForLevel(level) - spentPoints(ranks);
}

/** Why you cannot put a point here — null when you can. */
export function blockedReason(node, level, ranks) {
  const rank = ranks[node.id] || 0;
  if (rank >= node.maxRank) return 'Maks rang';
  if (level < node.reqLevel) return `Kræver niveau ${node.reqLevel}`;
  for (const req of node.requires) {
    if (!(ranks[req] > 0)) return `Kræver ${NODE_BY_ID[req].name}`;
  }
  if (pointsLeft(level, ranks) <= 0) return 'Ingen point tilbage';
  return null;
}

export function canSpend(node, level, ranks) {
  return blockedReason(node, level, ranks) === null;
}

/* --------------------------- the numbers --------------------------- */

/** Rank multiplier: 1.0 at rank 1, 1.72 at rank 5. */
export function rankMultiplier(rank) {
  return rank <= 0 ? 0 : 1 + (rank - 1) * RANK_STEP;
}

/** What related skills add. Returns a multiplier at or above 1. */
export function synergyMultiplier(node, ranks) {
  if (!node.synergies) return 1;
  let bonus = 0;
  for (const syn of node.synergies) bonus += (ranks[syn.id] || 0) * syn.per;
  return 1 + bonus;
}

/** Total power multiplier for an active skill: zero if you have not taken it. */
export function skillPower(nodeId, ranks) {
  const node = NODE_BY_ID[nodeId];
  const rank = ranks[nodeId] || 0;
  if (!node || rank <= 0) return 0;
  return rankMultiplier(rank) * synergyMultiplier(node, ranks);
}

/** Everything the passives add up to, as plain numbers the game can apply. */
export function passiveTotals(ranks) {
  const out = { weaponDamage: 0, lifesteal: 0, moveSpeed: 0, attackSpeed: 0, crit: 0, maxLife: 0, healing: 0, regen: 0 };
  for (const node of NODES) {
    const rank = ranks[node.id] || 0;
    if (!rank || !node.grants) continue;
    for (const [key, per] of Object.entries(node.grants)) out[key] += per * rank;
  }
  return out;
}

/** The skills you have taken that can actually be put on the bar. */
export function unlockedActives(ranks) {
  return NODES.filter(n => n.kind === 'active' && (ranks[n.id] || 0) > 0);
}

/** A readable breakdown for the tooltip. */
export function describe(node, ranks, level) {
  const rank = ranks[node.id] || 0;
  const lines = [node.text];
  if (node.kind === 'active') {
    const now = skillPower(node.id, ranks);
    const next = rank < node.maxRank
      ? rankMultiplier(rank + 1) * synergyMultiplier(node, ranks) : null;
    lines.push(rank > 0
      ? `Styrke: ${(now * 100).toFixed(0)}%${next ? ` → ${(next * 100).toFixed(0)}%` : ''}`
      : `Styrke ved rang 1: ${(synergyMultiplier(node, ranks) * 100).toFixed(0)}%`);
    if (node.synergies) {
      for (const syn of node.synergies) {
        const other = NODE_BY_ID[syn.id];
        const r = ranks[syn.id] || 0;
        lines.push(`↳ ${other.name}: +${(syn.per * 100).toFixed(0)}% pr. rang (nu ${r} = +${(r * syn.per * 100).toFixed(0)}%)`);
      }
    }
  }
  return lines;
}

/* ------------------------------ the bar ------------------------------ */

/** Drop anything from the bar you no longer have, and keep it 8 long. */
export function sanitizeBar(bar, ranks, slots) {
  const out = new Array(slots).fill(null);
  const seen = new Set();
  for (let i = 0; i < slots; i++) {
    const id = bar && bar[i];
    const node = NODE_BY_ID[id];
    if (!node || node.kind !== 'active') continue;
    if (!(ranks[id] > 0) || seen.has(id)) continue;
    seen.add(id);
    out[i] = id;
  }
  return out;
}

/** Put a skill in the first free slot. Returns the slot, or -1 if the bar is full. */
export function autoAssign(bar, id) {
  if (bar.includes(id)) return bar.indexOf(id);
  const free = bar.indexOf(null);
  if (free >= 0) bar[free] = id;
  return free;
}
