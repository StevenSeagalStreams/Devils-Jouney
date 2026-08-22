import { drawItemIcon, statLines, itemScore, STAT_LABEL, POTION, drawPotionIcon } from './items.js';
import { ABILITIES, ABILITY_BY_ID, abilityPower, drawAbilityIcon, drawPassiveIcon, BAR_SLOTS } from './abilities.js';
import { BRANCHES, NODES, NODE_BY_ID, blockedReason, isReachable, describe, skillPower,
         synergyMultiplier, rankMultiplier, pointsLeft, spentPoints } from './skilltree.js';

const $ = sel => document.querySelector(sel);

export class UI {
  constructor(game) {
    this.game = game;
    this.worldUI = $('#world-ui');
    this.hotbar = $('#hotbar');
    this.bag = $('#bag');
    this.inventory = $('#inventory');
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tooltip';
    document.body.appendChild(this.tooltip);

    this.vignette = document.createElement('div');
    this.vignette.id = 'damage-vignette';
    $('#hud').prepend(this.vignette);

    this.enemyBars = new Map();
    this.shop = $('#shop');
    this.prompt = $('#prompt');
    $('#shop-close').addEventListener('click', () => this.closeShop());
    this.buildHotbar();
    this.buildPotion();
    this.bindPanel();
    this.buildSkills();
  }

  /* ---------------- ability bar ---------------- */
  /** Eight slots. What sits in each one is the player's choice, made in the
      skill tree, so the bar is drawn from state.bar rather than a fixed list. */
  buildHotbar() {
    this.hotbar.innerHTML = '';
    this.abilitySlots = [];
    for (let i = 0; i < BAR_SLOTS; i++) {
      const el = document.createElement('div');
      el.className = 'slot ability empty';
      el.innerHTML = `<canvas class="icon" width="96" height="96"></canvas>
        <div class="cd"><span></span></div>
        <div class="rank"></div>
        <span class="key">${i + 1}</span>`;
      el.addEventListener('click', () => this.game.useAbility(i));
      el.addEventListener('contextmenu', e => { e.preventDefault(); this.game.clearSlot(i); });
      el.addEventListener('mousemove', e => {
        if (document.pointerLockElement) { this.tooltip.style.display = 'none'; return; }
        const id = this.game.state.bar[i];
        if (id) this.showAbilityTip(id, e.clientX, e.clientY);
        else this.tooltip.style.display = 'none';
      });
      el.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; });
      this.hotbar.appendChild(el);
      this.abilitySlots.push(el);
    }
    this.barDrawn = new Array(BAR_SLOTS).fill(undefined);
    const eq = $('#equipped-slot');
    eq.querySelector('.key')?.remove();
    this.attachTip(eq, () => this.game.state.equipped.weapon);
  }

  /* ---------------- potions ---------------- */
  buildPotion() {
    const el = $('#potion-slot');
    el.style.setProperty('--rare', POTION.color);
    el.addEventListener('click', () => this.game.drinkPotion());
    el.addEventListener('mousemove', e => {
      if (document.pointerLockElement) { this.tooltip.style.display = 'none'; return; }
      const t = this.game.totals();
      this.tooltip.innerHTML = `
        <div class="tt-name" style="color:${POTION.color}">${POTION.name}</div>
        <div class="tt-type">consumable · key Q</div>
        <div class="tt-stat">Drink to get ${Math.round(POTION.heal * 100)}% of your life back
          — about ${Math.round(t.maxHp * POTION.heal)} right now.</div>
        <div class="tt-cmp">${POTION.cooldown}s between drinks · you carry ${this.game.state.potions}
          of ${POTION.maxCarry}</div>`;
      this.placeTip(e.clientX, e.clientY);
    });
    el.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; });
    this.potionDrawn = null;
  }

  renderPotions() {
    const s = this.game.state;
    const el = $('#potion-slot');
    const empty = s.potions <= 0;
    if (this.potionDrawn !== s.potions) {
      this.potionDrawn = s.potions;
      drawPotionIcon(el.querySelector('canvas'), s.potions);
      el.classList.toggle('empty', empty);
      $('#potion-count').textContent = s.potions;
    }
    const wedge = el.querySelector('.cd');
    if (s.potionCd > 0) {
      wedge.style.display = 'block';
      wedge.style.background =
        `conic-gradient(rgba(0,0,0,.72) ${(s.potionCd / POTION.cooldown) * 360}deg, rgba(0,0,0,0) 0deg)`;
      wedge.firstElementChild.textContent = Math.ceil(s.potionCd);
    } else if (wedge.style.display !== 'none') {
      wedge.style.display = 'none';
    }
  }

  /** One tooltip body for a skill, used by the bar and by the tree. */
  skillTipHtml(nodeId) {
    const s = this.game.state;
    const node = NODE_BY_ID[nodeId];
    const rank = s.ranks[nodeId] || 0;
    const branch = BRANCHES.find(b => b.id === node.branch);
    const active = node.kind === 'active';
    const d = describe(node, s.ranks, s.level);
    const why = blockedReason(node, s.level, s.ranks);

    let html = `
      <div class="tt-name" style="color:${rank ? branch.color : '#8a8a8a'}">${node.name}</div>
      <div class="tt-type">${branch.name} · ${active ? 'active' : 'passive'} · rank ${rank}/${node.maxRank}</div>`;
    // the reason you cannot take it belongs at the top, not buried at the bottom
    if (why) {
      html += `<div class="tt-block ${why.code === 'maxed' ? 'good' : 'bad'}">${why.text}</div>`;
    }

    if (active) {
      // the concrete line says everything node.text does, with the number in it
      const ability = ABILITY_BY_ID[node.ability];
      const mult = skillPower(nodeId, s.ranks) || rankMultiplier(1) * synergyMultiplier(node, s.ranks);
      html += `<div class="tt-stat">${ability.text(abilityPower(ability, mult, this.game.totals()))}</div>`;
    } else {
      html += `<div class="tt-stat">${d.body}</div>`;
    }
    if (d.power) html += `<div class="tt-power">${d.power}</div>`;
    if (active) {
      const a = ABILITY_BY_ID[node.ability];
      html += `<div class="tt-cmp">${a.stamina ? `${a.stamina} stamina · ` : ''}${a.cooldown}s cooldown</div>`;
    }

    // both ends of every synergy — the far end is invisible from here otherwise
    const taken = d.synergies.filter(sy => sy.rank > 0);
    const rest = d.synergies.filter(sy => sy.rank === 0);
    if (taken.length || rest.length) {
      html += '<div class="tt-syn">';
      for (const sy of taken) html += `<div class="on">↳ ${sy.text}</div>`;
      if (rest.length) {
        html += `<div>↳ Also grows with: ${rest.map(sy => sy.name).join(', ')}</div>`;
      }
      html += '</div>';
    }
    if (d.feeds.length) {
      html += `<div class="tt-syn"><div>↳ Strengthens: ${d.feeds.join(', ')}</div></div>`;
    }
    return html;
  }

  showAbilityTip(nodeId, x, y) {
    this.tooltip.innerHTML = this.skillTipHtml(nodeId);
    this.placeTip(x, y);
  }

  placeTip(x, y) {
    this.tooltip.style.display = 'block';
    const r = this.tooltip.getBoundingClientRect();
    this.tooltip.style.left = Math.min(x + 16, window.innerWidth - r.width - 8) + 'px';
    this.tooltip.style.top = Math.max(8, y - r.height - 12) + 'px';
  }

  /** Cheap per-frame pass: icons are only redrawn when the bar changes. */
  renderAbilities() {
    const s = this.game.state;
    for (let i = 0; i < BAR_SLOTS; i++) {
      const el = this.abilitySlots[i];
      const nodeId = s.bar[i];
      const node = nodeId ? NODE_BY_ID[nodeId] : null;
      const rank = nodeId ? (s.ranks[nodeId] || 0) : 0;
      const stamp = nodeId ? `${nodeId}:${rank}` : '';
      if (this.barDrawn[i] !== stamp) {
        this.barDrawn[i] = stamp;
        const canvas = el.querySelector('canvas');
        if (node) {
          const ability = ABILITY_BY_ID[node.ability];
          drawAbilityIcon(canvas, ability, false);
          el.classList.remove('empty');
          el.style.setProperty('--rare', ability.color);
          el.querySelector('.rank').textContent = rank;
        } else {
          canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
          el.classList.add('empty');
          el.style.setProperty('--rare', '#333');
          el.querySelector('.rank').textContent = '';
        }
      }
      if (!node) continue;
      const ability = ABILITY_BY_ID[node.ability];
      const cd = s.cooldowns[ability.id] || 0;
      const wedge = el.querySelector('.cd');
      if (cd > 0) {
        const frac = cd / ability.cooldown;
        wedge.style.display = 'block';
        wedge.style.background =
          `conic-gradient(rgba(0,0,0,.72) ${frac * 360}deg, rgba(0,0,0,0) 0deg)`;
        wedge.firstElementChild.textContent = cd >= 1 ? Math.ceil(cd) : cd.toFixed(1);
      } else if (wedge.style.display !== 'none') {
        wedge.style.display = 'none';
      }
    }
  }

  /** Small pills for timed effects, above the dock. */
  renderBuffs(buffs) {
    const host = $('#buffs');
    const active = Object.entries(buffs).filter(([, t]) => t > 0);
    if (!active.length) { host.innerHTML = ''; host.dataset.keys = ''; return; }
    const keys = active.map(([k]) => k).join(',');
    if (host.dataset.keys !== keys) {
      host.dataset.keys = keys;
      host.innerHTML = active.map(([k]) => {
        const a = ABILITIES.find(x => x.buff === k);
        return `<div class="buff" style="--c:${a.color}"><b>${a.name}</b><span data-b="${k}"></span></div>`;
      }).join('');
    }
    for (const [k, t] of active) {
      const el = host.querySelector(`[data-b="${k}"]`);
      if (el) el.textContent = `${Math.ceil(t)}s`;
    }
  }

  /* ---------------- tooltip ---------------- */
  attachTip(el, getItem) {
    el.addEventListener('mousemove', e => {
      if (document.pointerLockElement) { this.tooltip.style.display = 'none'; return; }
      const item = getItem();
      if (!item) { this.tooltip.style.display = 'none'; return; }
      this.showTip(item, e.clientX, e.clientY);
    });
    el.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; });
  }

  showTip(item, x, y) {
    const equipped = this.game.state.equipped[item.slot];
    const diff = itemScore(item) - itemScore(equipped);
    let cmp = '';
    if (equipped && equipped.id !== item.id) {
      cmp = diff > 0
        ? '<div class="tt-cmp up">▲ Better than what you are wearing</div>'
        : diff < 0 ? '<div class="tt-cmp down">▼ Worse than what you are wearing</div>'
          : '<div class="tt-cmp">The same as what you are wearing</div>';
    } else if (equipped && equipped.id === item.id) {
      cmp = '<div class="tt-cmp">You are wearing this</div>';
    }
    this.tooltip.innerHTML = `
      <div class="tt-name" style="color:${item.color}">${item.name}</div>
      <div class="tt-type">${item.rarityName} · level ${item.level}</div>
      ${statLines(item).map(s => `<div class="tt-stat">${s}</div>`).join('')}
      ${cmp}`;
    this.tooltip.style.display = 'block';
    const r = this.tooltip.getBoundingClientRect();
    this.tooltip.style.left = Math.min(x + 16, window.innerWidth - r.width - 8) + 'px';
    this.tooltip.style.top = Math.max(8, y - r.height - 12) + 'px';
  }

  /* ---------------- panel ---------------- */
  bindPanel() {
    $('#inv-close').addEventListener('click', () => this.toggleInventory(false));
    this.equipEls = {};
    for (const el of document.querySelectorAll('.slot.equip')) {
      const slot = el.dataset.equip;
      this.equipEls[slot] = el;
      this.attachTip(el, () => this.game.state.equipped[slot]);
      el.addEventListener('click', () => {
        const it = this.game.state.equipped[slot];
        if (it) this.game.unequip(slot);
      });
    }
  }

  /* ---------------- skill tree ---------------- */
  buildSkills() {
    this.skills = $('#skills');
    this.pickedSlot = -1;                  // bar slot waiting for a skill
    $('#skills-close').addEventListener('click', () => this.toggleSkills(false));
    $('#skills-reset').addEventListener('click', () => {
      if (!spentPoints(this.game.state.ranks)) return;
      this.game.resetTree();
      this.toast('All your skill points have been given back', 1800);
    });

    // three columns, one per branch, nodes stacked by tier
    const cols = $('#skill-cols');
    cols.innerHTML = '';
    this.nodeEls = {};
    this.skillCols = [];
    for (const branch of BRANCHES) {
      const col = document.createElement('div');
      col.className = 'skill-col';
      col.style.setProperty('--c', branch.color);
      col.innerHTML = `<svg class="skill-links"></svg>
        <div class="skill-branch"><b>${branch.name}</b><span>${branch.blurb}</span></div>`;
      for (const tier of [1, 2, 3]) {
        const row = document.createElement('div');
        row.className = 'skill-row';
        for (const node of NODES.filter(n => n.branch === branch.id && n.tier === tier)) {
          const el = document.createElement('div');
          el.className = 'skill-node';
          el.className = `skill-node ${node.kind}`;
          el.innerHTML = `<div class="sn-icon"><canvas width="96" height="96"></canvas>
              <div class="sn-kind">${node.kind === 'active' ? 'active' : 'passive'}</div>
              <div class="sn-rank"><b>0</b>/${node.maxRank}</div></div>
            <div class="sn-name">${node.name}</div>
            <div class="sn-pips">${'<i></i>'.repeat(node.maxRank)}</div>`;
          el.addEventListener('click', () => this.clickNode(node));
          el.addEventListener('mousemove', e => {
            this.tooltip.innerHTML = this.skillTipHtml(node.id);
            this.placeTip(e.clientX, e.clientY);
          });
          el.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; });
          row.appendChild(el);
          this.nodeEls[node.id] = el;
        }
        col.appendChild(row);
      }
      cols.appendChild(col);
      this.skillCols.push({ col, branch: branch.id });
    }

    // the eight slots, mirrored from the hotbar
    const bar = $('#skill-bar');
    bar.innerHTML = '';
    this.skillBarEls = [];
    for (let i = 0; i < BAR_SLOTS; i++) {
      const el = document.createElement('div');
      el.className = 'slot ability empty';
      el.innerHTML = `<canvas class="icon" width="96" height="96"></canvas>
        <div class="rank"></div>
        <span class="key">${i + 1}</span>`;
      el.addEventListener('click', () => {
        this.pickedSlot = this.pickedSlot === i ? -1 : i;
        this.renderSkills();
      });
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.game.clearSlot(i);
      });
      bar.appendChild(el);
      this.skillBarEls.push(el);
    }
    this.skillBarDrawn = new Array(BAR_SLOTS).fill(undefined);
    this.renderSkills();
  }

  /** A click on a node either assigns it to a waiting slot, or spends a point. */
  clickNode(node) {
    const s = this.game.state;
    // While a slot is armed, a click can only ever mean "put this here" — it must
    // not quietly spend a point on whatever the player happened to hit.
    if (this.pickedSlot >= 0) {
      if (node.kind !== 'active') {
        this.toast('Passives cannot go on the bar', 1500);
      } else if (!(s.ranks[node.id] > 0)) {
        this.toast('You have not learned that skill yet', 1500);
      } else {
        this.game.assignBar(this.pickedSlot, node.id);
        this.pickedSlot = -1;
      }
      this.renderSkills();
      return;
    }
    const why = blockedReason(node, s.level, s.ranks);
    if (why) { this.toast(why.text, 1500); return; }
    this.game.spendPoint(node.id);
    // the tooltip is the whole point of the click — do not leave it a rank behind
    this.tooltip.innerHTML = this.skillTipHtml(node.id);
  }

  /** Faint lines from a skill to the ones it needs. Only measurable once the
      panel is on screen, so it is redrawn every time the panel opens. */
  drawSkillLinks() {
    for (const { col, branch } of this.skillCols) {
      const svg = col.querySelector('.skill-links');
      const base = col.getBoundingClientRect();
      if (!base.width) return;                       // panel is hidden
      svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);
      svg.setAttribute('width', base.width);
      svg.setAttribute('height', base.height);
      const parts = [];
      for (const node of NODES) {
        if (node.branch !== branch || !this.nodeEls[node.id] || !node.requires.length) continue;
        const to = this.nodeEls[node.id].querySelector('.sn-icon').getBoundingClientRect();
        for (const req of node.requires) {
          const from = this.nodeEls[req]?.querySelector('.sn-icon').getBoundingClientRect();
          if (!from) continue;
          const lit = (this.game.state.ranks[req] || 0) > 0 ? ' class="on"' : '';
          const x1 = from.x + from.width / 2 - base.x, y1 = from.bottom - base.y;
          const x2 = to.x + to.width / 2 - base.x, y2 = to.y - base.y;
          // sit the horizontal run just above the target, clear of the row's labels
          const mid = y1 + (y2 - y1) * 0.82;
          parts.push(`<path${lit} d="M ${x1} ${y1} V ${mid} H ${x2} V ${y2}" />`);
        }
      }
      svg.innerHTML = parts.join('');
    }
  }

  renderSkills() {
    if (!this.nodeEls) return;
    const s = this.game.state;
    const left = pointsLeft(s.level, s.ranks);
    $('#skill-points').textContent = left;
    $('#skills-head-points').classList.toggle('has', left > 0);
    $('#skills-reset').disabled = !spentPoints(s.ranks);

    for (const node of NODES) {
      const el = this.nodeEls[node.id];
      const rank = s.ranks[node.id] || 0;
      const why = blockedReason(node, s.level, s.ranks);
      const reachable = isReachable(node, s.level, s.ranks);
      const branch = BRANCHES.find(b => b.id === node.branch);
      const stamp = `${rank}:${reachable}`;
      if (el.dataset.stamp !== stamp) {
        el.dataset.stamp = stamp;
        const canvas = el.querySelector('canvas');
        const dim = !rank && !reachable;
        if (node.kind === 'active') drawAbilityIcon(canvas, ABILITY_BY_ID[node.ability], dim);
        else drawPassiveIcon(canvas, node.id, branch.color, dim);
      }
      el.classList.toggle('locked', !rank && !reachable);
      el.classList.toggle('taken', rank > 0);
      el.classList.toggle('assignable', node.kind === 'active' && rank > 0);
      el.classList.toggle('ready', !why && left > 0);
      el.classList.toggle('maxed', rank >= node.maxRank);
      el.querySelector('.sn-rank b').textContent = rank;
      el.querySelectorAll('.sn-pips i').forEach((pip, i) => pip.classList.toggle('on', i < rank));
    }

    for (let i = 0; i < BAR_SLOTS; i++) {
      const el = this.skillBarEls[i];
      const id = s.bar[i];
      const node = id ? NODE_BY_ID[id] : null;
      el.classList.toggle('picked', this.pickedSlot === i);
      el.querySelector('.rank').textContent = node ? (s.ranks[id] || 0) : '';
      if (this.skillBarDrawn[i] === id) continue;
      this.skillBarDrawn[i] = id;
      const canvas = el.querySelector('canvas');
      if (node) {
        drawAbilityIcon(canvas, ABILITY_BY_ID[node.ability], false);
        el.classList.remove('empty');
        el.style.setProperty('--rare', ABILITY_BY_ID[node.ability].color);
      } else {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        el.classList.add('empty');
        el.style.setProperty('--rare', '#333');
      }
    }
    this.skills.classList.toggle('picking', this.pickedSlot >= 0);
    this.drawSkillLinks();
    $('#skill-hint').innerHTML = this.pickedSlot >= 0
      ? `Slot <b>${this.pickedSlot + 1}</b> is picked — now click the skill you want in it.`
      : 'Click a skill to put a point into it.<br>'
        + 'Click a slot below, then a skill, to place it there. Right-click empties a slot.';
  }

  toggleSkills(force) {
    const open = force ?? this.skills.classList.contains('hidden');
    if (open) this.inventory.classList.add('hidden');   // one panel at a time
    this.skills.classList.toggle('hidden', !open);
    this.tooltip.style.display = 'none';
    this.pickedSlot = -1;
    if (open) this.renderSkills();
    return open;
  }

  get skillsOpen() { return !this.skills.classList.contains('hidden'); }

  toggleInventory(force) {
    const open = force ?? this.inventory.classList.contains('hidden');
    if (open) this.skills?.classList.add('hidden');
    this.inventory.classList.toggle('hidden', !open);
    this.tooltip.style.display = 'none';
    if (open) this.renderBag();
    return open;
  }

  get inventoryOpen() { return !this.inventory.classList.contains('hidden'); }

  /* ---------------- rendering ---------------- */
  renderAll() {
    this.renderEquipped();
    this.renderBag();
    this.renderStats();
  }

  renderEquipped() {
    const w = this.game.state.equipped.weapon;
    const slot = $('#equipped-slot');
    drawItemIcon(slot.querySelector('canvas'), w);
    slot.classList.toggle('filled', !!w);
    slot.style.setProperty('--rare', w ? w.color : '#8a8a8a');
    $('#equipped-name').textContent = w ? w.name : 'No weapon';
    $('#equipped-stats').innerHTML = w ? statLines(w).map(s => `<div>${s}</div>`).join('') : '<div>bare fists</div>';
  }

  renderBag() {
    // slots are rebuilt below, so any hovered slot never fires mouseleave
    this.tooltip.style.display = 'none';
    const bag = this.game.state.bag;
    this.bag.innerHTML = '';
    for (let i = 0; i < Math.max(18, bag.length); i++) {
      const item = bag[i];
      const el = document.createElement('div');
      el.className = 'slot' + (item ? ' filled' : '');
      if (item) {
        el.style.setProperty('--rare', item.color);
        const c = document.createElement('canvas');
        c.width = c.height = 96;
        c.className = 'icon';
        el.appendChild(c);
        drawItemIcon(c, item);
        el.addEventListener('click', () => this.game.equip(item));
        el.addEventListener('contextmenu', e => { e.preventDefault(); this.game.dropItem(item); });
        this.attachTip(el, () => item);
      }
      this.bag.appendChild(el);
    }
    for (const [slot, el] of Object.entries(this.equipEls)) {
      const item = this.game.state.equipped[slot];
      el.innerHTML = item ? '' : `<span class="ph">${{ weapon: 'Weapon', armor: 'Armour', trinket: 'Amulet' }[slot]}</span>`;
      el.classList.toggle('filled', !!item);
      el.style.setProperty('--rare', item ? item.color : '#383838');
      if (item) {
        const c = document.createElement('canvas');
        c.width = c.height = 96;
        c.className = 'icon';
        el.appendChild(c);
        drawItemIcon(c, item);
      }
    }
    this.renderStats();
  }

  renderStats() {
    const s = this.game.state;
    const t = this.game.totals();
    $('#stat-block').innerHTML = `
      <div>Level <b>${s.level}</b></div>
      <div>Life <b>${Math.ceil(s.hp)} / ${t.maxHp}</b></div>
      <div>${STAT_LABEL.skade} <b>${t.damage}</b></div>
      <div>${STAT_LABEL.smidighed} <b>${t.smidighed}</b></div>
      <div>${STAT_LABEL.styrke} <b>${t.styrke}</b></div>
      <div>Critical <b>${Math.round(t.crit * 100)}%</b></div>
      <div>Skill points left <b>${t.skillPoints}</b></div>`;
  }

  /** A banked skill point should never be invisible — it is the one thing a
   *  new player forgets they have. */
  setSkillNudge(left) {
    if (this.nudgeLeft === left) return;
    this.nudgeLeft = left;
    const el = $('#skill-nudge');
    el.classList.toggle('hidden', left <= 0);
    if (left > 0) {
      $('#nudge-count').textContent = left;
      el.lastChild.previousSibling.textContent = left === 1 ? ' skill point · ' : ' skill points · ';
    }
  }

  setBars(hpPct, staPct, xpPct, level) {
    $('#health-fill').style.width = (hpPct * 100).toFixed(1) + '%';
    $('#stamina-fill').style.width = (staPct * 100).toFixed(1) + '%';
    $('#xp-fill').style.width = (xpPct * 100).toFixed(1) + '%';
    $('#level-label').textContent = level;
  }

  /* ---------------- world overlays ---------------- */
  floatText(text, screen, kind = 'dmg') {
    const el = document.createElement('div');
    el.className = `float-num ${kind}`;
    el.textContent = text;
    el.style.top = Math.max(20, Math.min(window.innerHeight - 20, screen.y)) + 'px';
    el.style.left = screen.x + 'px';
    this.worldUI.appendChild(el);
    const pad = el.offsetWidth / 2 + 8;
    el.style.left = Math.max(pad, Math.min(window.innerWidth - pad, screen.x)) + 'px';
    setTimeout(() => el.remove(), 1150);
  }

  enemyBar(id) {
    let bar = this.enemyBars.get(id);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'enemy-bar';
      bar.innerHTML = '<div class="fill"></div>';
      this.worldUI.appendChild(bar);
      this.enemyBars.set(id, bar);
    }
    return bar;
  }

  updateEnemyBar(id, { x, y, visible, pct }) {
    const bar = this.enemyBar(id);
    bar.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    bar.style.left = x + 'px';
    bar.style.top = y + 'px';
    bar.querySelector('.fill').style.width = Math.max(0, pct * 100) + '%';
  }

  removeEnemyBar(id) {
    const bar = this.enemyBars.get(id);
    if (bar) { bar.remove(); this.enemyBars.delete(id); }
  }

  /* ---------------- town ---------------- */
  setGold(gold) {
    $('#gold').textContent = gold;
    $('#shop-gold').textContent = gold;
  }

  showPrompt(html) {
    this.prompt.innerHTML = html;
    this.prompt.classList.remove('hidden');
  }

  hidePrompt() { this.prompt.classList.add('hidden'); }

  get shopOpen() { return !this.shop.classList.contains('hidden'); }

  closeShop() {
    this.shop.classList.add('hidden');
    this.tooltip.style.display = 'none';
    this.onShopClose?.();
  }

  /** Healer: one button, priced off the life you are missing. */
  openHealer(game) {
    const t = game.totals();
    const missing = Math.max(0, t.maxHp - game.state.hp);
    const cost = game.healCost();
    const afford = game.state.gold >= cost;
    $('#shop-title').textContent = 'The Healer';
    $('#shop-body').innerHTML = `
      <div class="heal-card shop-col">
        <p>You have <b>${Math.ceil(game.state.hp)} / ${t.maxHp}</b> life.<br>
        ${missing <= 0 ? 'There is nothing wrong with you.' : `I will make you whole again for <b>${cost}</b> gold.`}</p>
        <button class="big" id="heal-btn" ${missing <= 0 || !afford ? 'disabled' : ''}>
          ${missing <= 0 ? 'You are well' : afford ? `Heal me (${cost} gold)` : `Not enough gold (${cost})`}
        </button>
      </div>`;
    const btn = $('#heal-btn');
    if (btn) btn.addEventListener('click', () => { game.buyHeal(); this.openHealer(game); });
    this.shop.classList.remove('hidden');
    this.setGold(game.state.gold);
  }

  /** Merchant: his stock on the left, your bag on the right. */
  openMerchant(game) {
    $('#shop-title').textContent = 'The Merchant';
    const row = (item, label, price, enabled, onClick) => {
      const el = document.createElement('div');
      el.className = 'shop-row';
      el.style.setProperty('--rare', item.color);
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      el.appendChild(c);
      drawItemIcon(c, item);
      const info = document.createElement('div');
      info.className = 'info';
      info.innerHTML = `<div class="nm" style="color:${item.color}">${item.name}</div>
        <div class="st">${statLines(item).join(' · ')}</div>`;
      el.appendChild(info);
      const btn = document.createElement('button');
      btn.textContent = `${label} ${price}`;
      btn.disabled = !enabled;
      btn.addEventListener('click', onClick);
      el.appendChild(btn);
      this.attachTip(el, () => item);
      return el;
    };

    const body = $('#shop-body');
    body.innerHTML = `
      <div class="shop-col"><div class="col-label">For sale</div><div class="shop-list" id="buy-list"></div></div>
      <div class="shop-col"><div class="col-label">Your things</div><div class="shop-list" id="sell-list"></div></div>`;
    const buy = $('#buy-list'), sell = $('#sell-list');

    // potions first — they are what you actually come back for
    {
      const el = document.createElement('div');
      el.className = 'shop-row';
      el.style.setProperty('--rare', POTION.color);
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      el.appendChild(c);
      drawPotionIcon(c, 1);
      const info = document.createElement('div');
      info.className = 'info';
      info.innerHTML = `<div class="nm" style="color:${POTION.color}">${POTION.name}</div>
        <div class="st">back ${Math.round(POTION.heal * 100)}% of your life ·
          you carry ${game.state.potions}/${POTION.maxCarry}</div>`;
      el.appendChild(info);
      const btn = document.createElement('button');
      btn.textContent = `Buy ${POTION.price}`;
      btn.disabled = game.state.gold < POTION.price || game.state.potions >= POTION.maxCarry;
      btn.addEventListener('click', () => { game.buyPotion(); this.openMerchant(game); });
      el.appendChild(btn);
      buy.appendChild(el);
    }
    if (!game.stock.length) buy.innerHTML += '<div class="shop-empty">No gear for sale today.</div>';
    for (const item of game.stock) {
      const price = game.buyPrice(item);
      buy.appendChild(row(item, 'Buy', price, game.state.gold >= price,
        () => { game.buyItem(item); this.openMerchant(game); }));
    }
    if (!game.state.bag.length) sell.innerHTML = '<div class="shop-empty">Your bag is empty.</div>';
    for (const item of game.state.bag) {
      sell.appendChild(row(item, 'Sell', game.sellPrice(item), true,
        () => { game.sellItem(item); this.openMerchant(game); }));
    }
    this.shop.classList.remove('hidden');
    this.setGold(game.state.gold);
  }

  toast(msg, ms = 1600, kind = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = kind;                 // a level-up should not look like a hint
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), ms);
  }

  flashDamage() {
    this.vignette.classList.remove('hit');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('hit');
  }
}
