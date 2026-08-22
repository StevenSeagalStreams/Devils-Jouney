/* What each ability DOES. How strong it is, and whether you have it at all,
   comes from the skill tree — see skilltree.js. Numbers stay small and whole
   because they are shown to the player as-is. */

export const ABILITIES = [
  {
    id: 'hug', name: 'Hug',
    cooldown: 4, stamina: 12, kind: 'melee',
    power: 1.5, range: 3.2, arc: 0.35,
    color: '#e8e2d2',
    text: p => `Et hårdt hug: ${p} skade på den foran dig.`,
  },
  {
    id: 'hvirvelvind', name: 'Hvirvelvind',
    cooldown: 9, stamina: 14, kind: 'aoe',
    power: 1.1, range: 4,
    color: '#bfe3ff',
    text: p => `Snurrer rundt og rammer alt inden for 4 m og gør ${p} i skade.`,
  },
  {
    id: 'stormlob', name: 'Stormløb',
    cooldown: 8, stamina: 18, kind: 'charge',
    power: 1.3, range: 3.0, dash: 6,
    color: '#ffd479',
    text: p => `Styrter 6 m frem, skubber til og giver ${p} i skade.`,
  },
  {
    id: 'forbinding', name: 'Forbinding',
    cooldown: 24, stamina: 0, kind: 'heal',
    power: 0.3,
    color: '#7ce87c',
    text: p => `Binder dine sår: du får ${p} liv tilbage.`,
  },
  {
    id: 'stenhud', name: 'Stenhud',
    cooldown: 30, stamina: 0, kind: 'buff', buff: 'shield', duration: 7,
    power: 0.36, cap: 80,
    color: '#a8b6c4',
    text: p => `Din hud bliver til sten: ${p}% mindre skade i 7 sekunder.`,
  },
  {
    id: 'ildstod', name: 'Ildstød',
    cooldown: 10, stamina: 20, kind: 'bolt',
    power: 1.7, range: 11,
    color: '#ff8a3c',
    text: p => `Sender ild mod en fjende op til 11 m væk og gør ${p} i skade.`,
  },
  {
    id: 'kampraseri', name: 'Kampraseri',
    cooldown: 40, stamina: 0, kind: 'buff', buff: 'rage', duration: 6,
    power: 0.3, cap: 60,
    color: '#ff5a5a',
    text: p => `Du går bersærk: ${p}% mere skade i 6 sekunder.`,
  },
  {
    id: 'dommedag', name: 'Dommedag',
    cooldown: 30, stamina: 30, kind: 'aoe',
    power: 1.6, range: 7,
    color: '#c07bff',
    text: p => `Slår jorden itu: ${p} skade på alt inden for 7 m.`,
  },
];

export const BAR_SLOTS = 8;                     // eight, and that is the cap
export const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map(a => [a.id, a]));

/** The number the player sees, and the number the game applies. `mult` comes
 *  from the skill tree: rank scaling times synergies. */
export function abilityPower(ability, mult, totals) {
  if (!mult) return 0;
  if (ability.kind === 'heal') {
    return Math.round(totals.maxHp * ability.power * mult * (1 + (totals.healing || 0)));
  }
  // buffs read as a percentage, and are capped so a finished branch cannot
  // hand out immunity
  if (ability.kind === 'buff') return Math.min(ability.cap, Math.round(ability.power * 100 * mult));
  return Math.max(1, Math.round(totals.damage * ability.power * mult));
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
    case 'hug':                                  // a sword, mid-swing
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(-22, 26); g.lineTo(18, -14); g.stroke();     // blade
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(6, -26); g.lineTo(30, -2); g.stroke();       // crossguard
      g.beginPath(); g.arc(-26, 30, 5, 0, Math.PI * 2); g.fill();          // pommel
      g.lineWidth = 4;                                                     // the arc it cuts
      g.beginPath(); g.arc(-4, 4, 32, -Math.PI * 0.62, -Math.PI * 0.08); g.stroke();
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
    case 'forbinding': {                         // a bandage, wound and tied
      g.save();
      g.rotate(-Math.PI / 5);
      g.beginPath(); g.roundRect(-30, -9, 60, 18, 6); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.38)'; g.lineWidth = 3.5;
      for (const x of [-12, 0, 12]) { g.beginPath(); g.moveTo(x, -9); g.lineTo(x - 5, 9); g.stroke(); }
      g.restore();
      g.fillStyle = tint;
      g.beginPath(); g.arc(-19, -17, 6, 0, Math.PI * 2); g.fill();          // the knot
      g.beginPath(); g.arc(19, 17, 6, 0, Math.PI * 2); g.fill();
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
      g.moveTo(10, -30);                                                    // a licking tip
      g.bezierCurveTo(10, -14, 22, -6, 16, 10);
      g.bezierCurveTo(12, 24, -6, 28, -14, 16);
      g.bezierCurveTo(-22, 4, -10, -4, -4, -14);
      g.bezierCurveTo(-1, -20, 4, -24, 10, -30);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.28)';                                      // the hot core
      g.beginPath();
      g.moveTo(4, -10); g.bezierCurveTo(10, 2, 6, 14, -2, 16);
      g.bezierCurveTo(-10, 12, -8, 0, 4, -10);
      g.closePath(); g.fill();
      g.fillStyle = tint;
      break;
    }
    case 'kampraseri': {                         // a clenched fist
      g.beginPath();
      g.beginPath();                                                        // knuckles
      g.moveTo(-16, -4);
      for (const x of [-8, 2, 12]) { g.arc(x, -10, 7, Math.PI, 0); }
      g.lineTo(20, 8); g.lineTo(4, 24); g.lineTo(-16, 16);
      g.closePath(); g.fill();
      g.beginPath(); g.roundRect(-24, -2, 12, 18, 5); g.fill();              // thumb
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3.5;
      for (const x of [-8, 2, 12]) { g.beginPath(); g.moveTo(x, -3); g.lineTo(x, 8); g.stroke(); }
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

/* Passives have no ability behind them, so they get their own small glyphs.
   Same visual language as the ability icons: one clear shape, no detail. */
export function drawPassiveIcon(canvas, id, color, locked) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(w / 96, h / 96);
  g.lineJoin = g.lineCap = 'round';

  const tint = locked ? '#5a5a5a' : color;
  const glow = g.createRadialGradient(0, 0, 3, 0, 0, 46);
  glow.addColorStop(0, hexA(tint, locked ? 0.08 : 0.18));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(-48, -48, 96, 96);

  g.strokeStyle = tint;
  g.fillStyle = tint;
  g.lineWidth = 6;

  switch (id) {
    case 'skarp':                                // a whetstone edge
      g.beginPath(); g.moveTo(-26, 18); g.lineTo(18, -26); g.lineTo(26, -18); g.lineTo(-18, 26); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(-20, 14); g.lineTo(14, -20); g.stroke();
      break;
    case 'blodtorst':                            // two fangs over a drop
      g.beginPath(); g.moveTo(-24, -26); g.lineTo(-8, -26); g.lineTo(-16, -2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(8, -26); g.lineTo(24, -26); g.lineTo(16, -2); g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(0, -2);
      g.bezierCurveTo(14, 12, 14, 20, 0, 27);
      g.bezierCurveTo(-14, 20, -14, 12, 0, -2);
      g.closePath(); g.fill();
      break;
    case 'fodfaeste':                            // a boot with a feather on it
      g.beginPath();
      g.moveTo(-8, -6); g.lineTo(6, -6); g.lineTo(8, 10); g.lineTo(24, 17); g.lineTo(24, 27);
      g.lineTo(-8, 27); g.closePath(); g.fill();
      g.beginPath();                                                       // the feather
      g.moveTo(-4, -30);
      g.bezierCurveTo(14, -26, 16, -12, 2, -12);
      g.bezierCurveTo(-8, -12, -10, -22, -4, -30);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-3, -29); g.lineTo(2, -13); g.stroke();
      break;
    case 'praecision':                           // a target
      g.lineWidth = 6;
      g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(0, 0, 3.5, 0, Math.PI * 2); g.fill();
      break;
    case 'haerdet':                              // stacked plates
      for (const y of [-20, -2, 16]) { g.beginPath(); g.roundRect(-24, y, 48, 12, 5); g.fill(); }
      break;
    case 'gengaeld': {                           // two crossed swords
      g.lineWidth = 7;
      for (const dir of [1, -1]) {
        g.beginPath(); g.moveTo(dir * -20, 22); g.lineTo(dir * 18, -20); g.stroke();
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(dir * 6, -26); g.lineTo(dir * 26, -8); g.stroke();   // guard
        g.beginPath(); g.arc(dir * -24, 26, 4.5, 0, Math.PI * 2); g.fill();          // pommel
        g.lineWidth = 7;
      }
      break;
    }
    case 'livskraft': {                          // a heart with a pulse line
      g.beginPath();
      g.moveTo(0, 24);
      g.bezierCurveTo(-30, 4, -22, -22, -8, -18);
      g.bezierCurveTo(-3, -16, 0, -11, 0, -11);
      g.bezierCurveTo(0, -11, 3, -16, 8, -18);
      g.bezierCurveTo(22, -22, 30, 4, 0, 24);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(-18, -2); g.lineTo(-7, -2); g.lineTo(-2, -10); g.lineTo(4, 6); g.lineTo(9, -2); g.lineTo(18, -2); g.stroke();
      break;
    }
    default:
      g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
