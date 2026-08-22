/* Loot rules are deliberately tiny: every item shows at most three small
   numbers so a new player can compare two swords at a glance. */

export const RARITIES = [
  { key: 'normal', name: 'Plain', color: '#b9b9b9', mult: 1.0, statCount: 1 },
  { key: 'fin', name: 'Fine', color: '#5fd35f', mult: 1.2, statCount: 2 },
  { key: 'sjaelden', name: 'Rare', color: '#4aa8ff', mult: 1.45, statCount: 2 },
  { key: 'episk', name: 'Epic', color: '#b569ff', mult: 1.75, statCount: 3 },
  { key: 'legendarisk', name: 'Legendary', color: '#ffa32e', mult: 2.1, statCount: 3 },
];

export const TYPES = {
  weapon: { name: 'Sword', slot: 'weapon', main: 'skade', base: 5 },
  armor: { name: 'Armour', slot: 'armor', main: 'liv', base: 7 },
  trinket: { name: 'Amulet', slot: 'trinket', main: 'smidighed', base: 3 },
};

export const STAT_LABEL = {
  skade: 'damage',
  liv: 'life',
  smidighed: 'agility',
  styrke: 'strength',
};

let nextId = 1;

/** Rarity roll gets a little kinder as the player levels. */
function rollRarity(level, rng, luck = 0) {
  // + level, not −: this is meant to get a little kinder as you level, and the
  // slope is small on purpose so legendaries stay legendary.
  const r = rng() * 100 + luck + Math.min(2.4, level * 0.08);
  if (r > 99.2) return RARITIES[4];
  if (r > 96) return RARITIES[3];
  if (r > 89) return RARITIES[2];
  if (r > 72) return RARITIES[1];
  return RARITIES[0];
}

export function makeItem(type, level, rng = Math.random, forcedRarity = null) {
  const t = TYPES[type];
  const rarity = forcedRarity ?? rollRarity(level, rng);
  const tier = RARITIES.indexOf(rarity);
  const scale = t.base + level * 1.6;
  const stats = {};
  stats[t.main] = Math.max(1, Math.round(scale * rarity.mult * (0.85 + rng() * 0.3)));

  const extras = ['smidighed', 'styrke', 'liv'].filter(s => s !== t.main);
  for (let i = 0; i < rarity.statCount - 1 && extras.length; i++) {
    const pick = extras.splice(Math.floor(rng() * extras.length), 1)[0];
    stats[pick] = Math.max(1, Math.round((1 + level * 0.45) * rarity.mult * (0.7 + rng() * 0.5)));
  }

  return {
    id: nextId++,
    type,
    slot: t.slot,
    tier,
    level,
    rarity: rarity.key,
    rarityName: rarity.name,
    color: rarity.color,
    name: `${rarity.name} ${t.name} ${level}`,
    stats,
  };
}

/** Rough single number used to say "this is better" in the tooltip. */
export function itemScore(item) {
  if (!item) return 0;
  const s = item.stats;
  return (s.skade || 0) * 2 + (s.styrke || 0) * 1.6 + (s.smidighed || 0) * 1.4 + (s.liv || 0) * 0.8;
}

const STAT_ORDER = ['smidighed', 'styrke', 'skade', 'liv'];
export function statLines(item) {
  return Object.entries(item.stats)
    .sort((a, b) => STAT_ORDER.indexOf(a[0]) - STAT_ORDER.indexOf(b[0]))
    .map(([k, v]) => `+${v} ${STAT_LABEL[k]}`);
}

/* ------------------------- canvas icons ------------------------- */
export function drawItemIcon(canvas, item) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  if (!item) return;

  const grd = g.createRadialGradient(w / 2, h * 0.42, 4, w / 2, h / 2, w * 0.62);
  grd.addColorStop(0, hexA(item.color, 0.08));
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);

  g.save();
  g.translate(w / 2, h / 2);
  const s = w / 96;
  g.scale(s, s);
  g.lineJoin = 'round';
  if (item.type === 'weapon') drawSword(g, item);
  else if (item.type === 'armor') drawArmor(g, item);
  else drawTrinket(g, item);
  g.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawSword(g, item) {
  g.rotate(-Math.PI / 4);
  const blade = ['#dfe5ea', '#e6f0e6', '#cfe9ff', '#e3d2ff', '#ffe6b0'][item.tier];
  const edge = ['#8e989f', '#8fb98f', '#7fb4d8', '#9b7fd8', '#d9aa54'][item.tier];
  // blade
  g.fillStyle = blade;
  g.beginPath();
  g.moveTo(0, -34); g.lineTo(6, -24); g.lineTo(6, 8); g.lineTo(-6, 8); g.lineTo(-6, -24);
  g.closePath(); g.fill();
  g.fillStyle = edge;
  g.beginPath(); g.moveTo(0, -34); g.lineTo(6, -24); g.lineTo(6, 8); g.lineTo(2, 8); g.lineTo(2, -26);
  g.closePath(); g.fill();
  // guard
  g.fillStyle = ['#9aa0a6', '#c8a54a', '#9fd4e4', '#a879f0', '#ffcc55'][item.tier];
  g.fillRect(-16, 8, 32, 7);
  // grip
  g.fillStyle = '#5a3a20';
  g.fillRect(-4, 15, 8, 18);
  g.fillStyle = ['#9aa0a6', '#c8a54a', '#9fd4e4', '#a879f0', '#ffcc55'][item.tier];
  g.beginPath(); g.arc(0, 36, 5, 0, Math.PI * 2); g.fill();
}

function drawArmor(g, item) {
  const base = ['#8a6a45', '#6f8a45', '#4a7fae', '#7a4aae', '#c98a2a'][item.tier];
  g.fillStyle = base;
  g.beginPath();
  g.moveTo(-22, -24); g.lineTo(-8, -30); g.lineTo(8, -30); g.lineTo(22, -24);
  g.lineTo(20, 22); g.lineTo(0, 32); g.lineTo(-20, 22);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(-20, -4, 40, 8);
  g.strokeStyle = 'rgba(255,255,255,.25)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -30); g.lineTo(0, 30); g.stroke();
}

function drawTrinket(g, item) {
  const gem = ['#c9c9c9', '#68d868', '#54b0ff', '#bd7bff', '#ffb340'][item.tier];
  g.strokeStyle = '#c9a554';
  g.lineWidth = 4;
  g.beginPath(); g.arc(0, -6, 20, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke();
  g.fillStyle = gem;
  g.beginPath();
  g.moveTo(0, 4); g.lineTo(12, 16); g.lineTo(0, 32); g.lineTo(-12, 16);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.beginPath(); g.moveTo(0, 4); g.lineTo(12, 16); g.lineTo(0, 16); g.closePath(); g.fill();
}
