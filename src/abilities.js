/* Eight abilities, unlocked as you level. Every one gets stronger with level
   twice over: its own power term grows past its unlock level, and the damage
   ones are multiples of your weapon damage, which grows with gear too.
   Keep the numbers small and whole — they are shown to the player as-is. */

export const ABILITIES = [
  {
    id: 'hug', key: '1', name: 'Hug', unlock: 1,
    cooldown: 4, stamina: 12, kind: 'melee',
    power: 1.8, range: 3.2, arc: 0.35, growth: 0.05,
    color: '#e8e2d2',
    text: p => `Et hårdt hug: ${p} skade på den foran dig.`,
  },
  {
    id: 'hvirvelvind', key: '2', name: 'Hvirvelvind', unlock: 2,
    cooldown: 9, stamina: 22, kind: 'aoe',
    power: 1.3, range: 3.6, growth: 0.05,
    color: '#bfe3ff',
    text: p => `Snurrer rundt og rammer alt indenfor 3,6 m for ${p} skade.`,
  },
  {
    id: 'stormlob', key: '3', name: 'Stormløb', unlock: 3,
    cooldown: 11, stamina: 18, kind: 'charge',
    power: 1.5, range: 3.0, dash: 6, growth: 0.05,
    color: '#ffd479',
    text: p => `Styrter 6 m frem og slår for ${p} skade med et skub.`,
  },
  {
    id: 'forbinding', key: '4', name: 'Forbinding', unlock: 5,
    cooldown: 24, stamina: 0, kind: 'heal',
    power: 0.3, growth: 0.02,
    color: '#7ce87c',
    text: p => `Binder dine sår: du får ${p} liv tilbage.`,
  },
  {
    id: 'stenhud', key: '5', name: 'Stenhud', unlock: 7,
    cooldown: 30, stamina: 0, kind: 'buff', buff: 'shield', duration: 7,
    power: 0.5, growth: 0,
    color: '#a8b6c4',
    text: () => 'Din hud bliver til sten: halv skade i 7 sekunder.',
  },
  {
    id: 'ildstod', key: '6', name: 'Ildstød', unlock: 9,
    cooldown: 12, stamina: 20, kind: 'bolt',
    power: 2.2, range: 11, growth: 0.06,
    color: '#ff8a3c',
    text: p => `Sender ild mod en fjende op til 11 m væk for ${p} skade.`,
  },
  {
    id: 'kampraseri', key: '7', name: 'Kampraseri', unlock: 12,
    cooldown: 40, stamina: 0, kind: 'buff', buff: 'rage', duration: 9,
    power: 0.6, growth: 0,
    color: '#ff5a5a',
    text: () => 'Du går bersærk: 60% mere skade i 9 sekunder.',
  },
  {
    id: 'dommedag', key: '8', name: 'Dommedag', unlock: 15,
    cooldown: 55, stamina: 30, kind: 'aoe',
    power: 4.0, range: 6.5, growth: 0.08,
    color: '#c07bff',
    text: p => `Slår jorden itu: ${p} skade på alt indenfor 6,5 m.`,
  },
];

export const MAX_ABILITIES = ABILITIES.length;   // eight, and that is the cap

/** How much bigger this ability is at the player's current level. */
export function abilityScale(ability, level) {
  return 1 + Math.max(0, level - ability.unlock) * ability.growth;
}

/** The number the player sees, and the number the game applies. */
export function abilityPower(ability, level, totals) {
  const scale = abilityScale(ability, level);
  if (ability.kind === 'heal') return Math.round(totals.maxHp * ability.power * scale);
  if (ability.kind === 'buff') return Math.round(ability.power * 100);
  return Math.max(1, Math.round(totals.damage * ability.power * scale));
}

export function unlockedAt(level) {
  return ABILITIES.filter(a => a.unlock <= level);
}

/* ------------------------- canvas icons ------------------------- */
export function drawAbilityIcon(canvas, ability, locked) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(w / 96, h / 96);
  g.lineJoin = g.lineCap = 'round';

  const tint = locked ? '#5a5a5a' : ability.color;
  const glow = g.createRadialGradient(0, 0, 3, 0, 0, 46);
  glow.addColorStop(0, hexA(tint, locked ? 0.10 : 0.22));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(-48, -48, 96, 96);

  g.strokeStyle = tint;
  g.fillStyle = tint;
  g.lineWidth = 6;

  switch (ability.id) {
    case 'hug':                                  // a diagonal slash
      g.beginPath(); g.moveTo(-24, 22); g.lineTo(22, -24); g.stroke();
      g.beginPath(); g.moveTo(6, -26); g.lineTo(26, -28); g.lineTo(24, -8); g.closePath(); g.fill();
      break;
    case 'hvirvelvind':                          // a spiral
      g.lineWidth = 5;
      g.beginPath();
      for (let i = 0; i <= 80; i++) {
        const t = i / 80 * Math.PI * 3.1, r = 4 + t * 5.2;
        const x = Math.cos(t) * r, y = Math.sin(t) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      break;
    case 'stormlob':                             // a forward arrow with speed lines
      g.beginPath(); g.moveTo(-6, -22); g.lineTo(22, 0); g.lineTo(-6, 22); g.closePath(); g.fill();
      g.lineWidth = 5;
      for (const y of [-12, 0, 12]) { g.beginPath(); g.moveTo(-28, y); g.lineTo(-14, y); g.stroke(); }
      break;
    case 'forbinding': {                         // a cross
      g.fillRect(-8, -26, 16, 52);
      g.fillRect(-26, -8, 52, 16);
      break;
    }
    case 'stenhud': {                            // a shield
      g.beginPath();
      g.moveTo(0, -28); g.lineTo(24, -16); g.lineTo(20, 14); g.lineTo(0, 28);
      g.lineTo(-20, 14); g.lineTo(-24, -16); g.closePath();
      g.lineWidth = 7; g.stroke();
      break;
    }
    case 'ildstod': {                            // a flame
      g.beginPath();
      g.moveTo(0, -28);
      g.bezierCurveTo(16, -10, 22, 4, 12, 18);
      g.bezierCurveTo(6, 26, -6, 26, -12, 18);
      g.bezierCurveTo(-22, 4, -14, -8, 0, -28);
      g.closePath(); g.fill();
      break;
    }
    case 'kampraseri': {                         // a clenched fist
      g.beginPath();
      g.moveTo(-18, -10); g.lineTo(16, -18); g.lineTo(22, 6); g.lineTo(6, 24); g.lineTo(-16, 16);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4;
      for (const y of [-6, 2, 10]) { g.beginPath(); g.moveTo(-10, y); g.lineTo(14, y - 4); g.stroke(); }
      break;
    }
    case 'dommedag': {                           // a falling star over cracked ground
      g.beginPath(); g.arc(2, -8, 13, 0, Math.PI * 2); g.fill();
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(-26, -30); g.lineTo(-8, -16); g.stroke();
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-26, 22); g.lineTo(-8, 14); g.lineTo(2, 24); g.lineTo(14, 12); g.lineTo(28, 20);
      g.stroke();
      break;
    }
  }
  g.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
