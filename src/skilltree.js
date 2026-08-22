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
    synergies: [{ id: 'skarp', per: 0.05 }],
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
    grants: { lifesteal: 0.01 },
    text: 'Du suger liv af dine slag: 1% af skaden pr. rang.',
  },
  {
    id: 'hvirvelvind', name: 'Hvirvelvind', branch: 'klinge', tier: 2, kind: 'active',
    ability: 'hvirvelvind', maxRank: 5, reqLevel: 6, requires: ['hug'],
    text: 'Snurrer rundt og rammer alt omkring dig.',
    synergies: [{ id: 'hug', per: 0.05 }, { id: 'skarp', per: 0.04 }],
  },
  {
    id: 'dommedag', name: 'Dommedag', branch: 'klinge', tier: 3, kind: 'active',
    ability: 'dommedag', maxRank: 5, reqLevel: 18, requires: ['hvirvelvind'],
    text: 'Slår jorden itu omkring dig.',
    synergies: [{ id: 'hvirvelvind', per: 0.06 }, { id: 'hug', per: 0.04 },
      { id: 'blodtorst', per: 0.03 }, { id: 'haerdet', per: 0.03 }],
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
    grants: { moveSpeed: 0.03, attackSpeed: 0.02 },
    text: 'Lettere på fødderne: +3% fart og +2% angrebstempo pr. rang.',
  },
  {
    id: 'ildstod', name: 'Ildstød', branch: 'jagt', tier: 2, kind: 'active',
    ability: 'ildstod', maxRank: 5, reqLevel: 6, requires: ['stormlob'],
    text: 'Sender ild mod en fjende på afstand.',
    synergies: [{ id: 'stormlob', per: 0.06 }, { id: 'praecision', per: 0.04 }],
  },
  {
    id: 'praecision', name: 'Præcision', branch: 'jagt', tier: 2, kind: 'passive',
    maxRank: 5, reqLevel: 6, requires: ['fodfaeste'],
    grants: { crit: 0.03 },
    text: 'Du finder hullerne i forsvaret: +3% kritisk chance pr. rang.',
  },
  {
    id: 'kampraseri', name: 'Kampraseri', branch: 'jagt', tier: 3, kind: 'active',
    ability: 'kampraseri', maxRank: 5, reqLevel: 18, requires: ['ildstod'],
    text: 'Du går bersærk og slår hårdere et stykke tid.',
    synergies: [{ id: 'fodfaeste', per: 0.05 }, { id: 'ildstod', per: 0.04 }, { id: 'skarp', per: 0.03 }],
  },

  /* ---------------------------- Vogter ---------------------------- */
  {
    id: 'forbinding', name: 'Forbinding', branch: 'vogter', tier: 1, kind: 'active',
    ability: 'forbinding', maxRank: 5, reqLevel: 1, requires: [],
    text: 'Binder dine sår midt i kampen.',
    synergies: [{ id: 'haerdet', per: 0.05 }, { id: 'fodfaeste', per: 0.03 }],
  },
  {
    id: 'haerdet', name: 'Hærdet', branch: 'vogter', tier: 1, kind: 'passive',
    maxRank: 5, reqLevel: 1, requires: [],
    grants: { maxLife: 0.05 },
    text: 'Sejt kød og gamle ar: +5% liv pr. rang.',
  },
  {
    id: 'gengaeld', name: 'Gengældelse', branch: 'vogter', tier: 2, kind: 'passive',
    maxRank: 5, reqLevel: 6, requires: ['haerdet'],
    grants: { weaponDamage: 0.02, maxLife: 0.02 },
    text: 'Du slår igen, hårdere: +2% våbenskade og +2% liv pr. rang.',
  },
  {
    id: 'stenhud', name: 'Stenhud', branch: 'vogter', tier: 2, kind: 'active',
    ability: 'stenhud', maxRank: 5, reqLevel: 6, requires: ['haerdet'],
    text: 'Din hud bliver til sten et stykke tid.',
    synergies: [{ id: 'haerdet', per: 0.05 }],
  },
  {
    id: 'livskraft', name: 'Livskraft', branch: 'vogter', tier: 3, kind: 'passive',
    maxRank: 5, reqLevel: 12, requires: ['stenhud'],
    grants: { healing: 0.08, regen: 1 },
    text: 'Kroppen læger sig selv: +8% helbredelse og +1 liv i sekundet pr. rang.',
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

/** Why you cannot put a point here — null when you can.
 *  Returns { code, text }: branch on `code`, show `text`. Never branch on the
 *  text, which is Danish and will be reworded. */
export function blockedReason(node, level, ranks) {
  const rank = ranks[node.id] || 0;
  if (rank >= node.maxRank) return { code: 'maxed', text: 'Højeste rang' };
  if (level < node.reqLevel) {
    return { code: 'level', text: `Kræver niveau ${node.reqLevel}` };
  }
  for (const req of node.requires) {
    if (!(ranks[req] > 0)) {
      return { code: 'requires', text: `Kræver ${NODE_BY_ID[req].name}` };
    }
  }
  if (pointsLeft(level, ranks) <= 0) {
    return { code: 'nopoints', text: 'Ingen evnepoint tilbage' };
  }
  return null;
}

export function canSpend(node, level, ranks) {
  return blockedReason(node, level, ranks) === null;
}

/** Could you ever put a point here, if you had one and were high enough?
 *  Used to decide whether to grey a node out — running out of points is not a
 *  reason to hide a skill you have already earned the right to take. */
export function isReachable(node, level, ranks) {
  const why = blockedReason(node, level, ranks);
  return !why || why.code === 'nopoints' || why.code === 'maxed';
}

/** The skills this one quietly makes stronger — the other half of a synergy,
 *  which is otherwise only visible from the far end. */
export function feeds(nodeId) {
  return NODES.filter(n => n.synergies?.some(sy => sy.id === nodeId));
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

/** How much a passive is giving you right now, as readable Danish. */
const GRANT_LABEL = {
  weaponDamage: ['% våbenskade', 100], lifesteal: ['% livssug', 100],
  moveSpeed: ['% fart', 100], attackSpeed: ['% angrebstempo', 100],
  crit: ['% kritisk chance', 100], maxLife: ['% liv', 100],
  healing: ['% helbredelse', 100], regen: [' liv i sekundet', 1],
};

/** A readable breakdown for the tooltip, as { body, power, synergies, feeds }. */
export function describe(node, ranks, level) {
  const rank = ranks[node.id] || 0;
  const out = { body: node.text, power: null, synergies: [], feeds: [] };

  if (node.kind === 'active') {
    const now = skillPower(node.id, ranks);
    const next = rank < node.maxRank
      ? rankMultiplier(rank + 1) * synergyMultiplier(node, ranks) : null;
    out.power = rank > 0
      ? `Styrke ${(now * 100).toFixed(0)}%${next ? ` → ${(next * 100).toFixed(0)}% ved næste rang` : ''}`
      : `Styrke ${(synergyMultiplier(node, ranks) * 100).toFixed(0)}% ved første rang`;
  } else if (node.grants && rank > 0) {
    out.power = 'Nu: ' + Object.entries(node.grants).map(([key, per]) => {
      const [label, mul] = GRANT_LABEL[key] || ['', 1];
      const val = n => +(per * n * mul).toFixed(2);
      return `+${val(rank)}${label}` + (rank < node.maxRank ? ` → +${val(rank + 1)}` : '');
    }).join(', ');
  }

  // what feeds this skill …
  for (const sy of node.synergies || []) {
    const other = NODE_BY_ID[sy.id];
    const r = ranks[sy.id] || 0;
    out.synergies.push({
      id: sy.id, name: other.name, per: sy.per, rank: r,
      text: `${other.name}: +${Math.round(sy.per * 100)}% pr. rang`
        + (r > 0 ? ` (nu ${r} = +${Math.round(r * sy.per * 100)}%)` : ''),
    });
  }
  // … and what this skill feeds, which is invisible from here otherwise
  out.feeds = feeds(node.id).map(n => n.name);
  return out;
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
