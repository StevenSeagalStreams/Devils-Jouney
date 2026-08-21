import { createMonsterModel, createBoarModel, createArcherModel, createGuardModel } from './characters.js';

/* One table describing every creature. `hit` is when the blow lands, so the
   whole wind-up is the player's reaction time; `track` is how fast it may keep
   re-aiming while winding up — zero means it commits and can be side-stepped. */

export const KINDS = {
  boar: {
    id: 'boar', name: 'Vildsvin', model: () => createBoarModel(),
    passive: true,                       // never starts a fight
    hp: 0.8, damage: 0.6, speed: 3.0, scale: 1.0, xp: 0.5, gold: 0.5,
    sight: 9, leash: 22, barY: 1.25,
    attacks: {
      stang: { kind: 'stang', hit: 0.55, recover: 0.45, range: 2.4, dmg: 1.0,
        cooldown: 1.3, track: 3.2, tell: '#ffb02e' },
    },
    choose: () => 'stang',
  },
  brute: {
    id: 'brute', name: 'Skovtrold', model: lvl => createMonsterModel((lvl - 1) % 3),
    hp: 1, damage: 1, speed: 2.5, scale: 1.0, xp: 1, gold: 1,
    sight: 12, leash: 20, barY: 1.85,
    attacks: {
      light: { kind: 'light', hit: 0.62, recover: 0.45, range: 2.7, dmg: 0.7,
        cooldown: 0.8, track: 2.6, tell: '#ffb02e' },
      heavy: { kind: 'heavy', hit: 1.25, recover: 0.9, range: 3.4, dmg: 2.4,
        cooldown: 1.6, track: 0, tell: '#ff3b1f' },
    },
    choose: m => (!m.lastHeavy && Math.random() < 0.4 ? 'heavy' : 'light'),
  },
  archer: {
    id: 'archer', name: 'Knoglebueskytte', model: () => createArcherModel(),
    hp: 0.6, damage: 0.9, speed: 2.4, scale: 1.0, xp: 1.1, gold: 1.1,
    sight: 15, leash: 26, barY: 1.75,
    keepAway: { min: 5.5, max: 11 },     // backs off if you close in
    attacks: {
      skud: { kind: 'skud', hit: 1.05, recover: 0.55, range: 15, dmg: 1.0,
        cooldown: 2.4, track: 1.5, tell: '#8ef0ff', projectile: true },
    },
    choose: () => 'skud',
  },
  guard: {
    id: 'guard', name: 'Skjoldvagt', model: () => createGuardModel(),
    hp: 1.9, damage: 1.1, speed: 1.7, scale: 1.0, xp: 1.4, gold: 1.4,
    sight: 11, leash: 18, barY: 2.0,
    blockFront: 0.85,                    // a hit to the shield barely scratches it
    attacks: {
      bash: { kind: 'bash', hit: 1.45, recover: 1.05, range: 3.1, dmg: 2.0,
        cooldown: 1.9, track: 0.8, tell: '#ff3b1f' },
    },
    choose: () => 'bash',
  },
};

/** Rolled stats for one creature of a kind at a level. */
export function statsFor(kindId, level) {
  const k = KINDS[kindId];
  const hp = Math.round((30 + (level - 1) * 9) * k.hp);
  return {
    kind: k,
    name: `${k.name} ${level}`,
    maxHp: hp,
    hp,
    damage: (5 + (level - 1) * 1.8) * k.damage,
    speed: k.speed,
    xp: Math.round((16 + level * 7) * k.xp),
    gold: Math.round((4 + level * 3) * k.gold),
  };
}
