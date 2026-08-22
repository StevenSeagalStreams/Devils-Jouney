import { drawItemIcon, statLines, itemScore, STAT_LABEL } from './items.js';
import { ABILITIES, ABILITY_BY_ID, abilityPower, drawAbilityIcon, drawPassiveIcon, BAR_SLOTS } from './abilities.js';
import { BRANCHES, NODES, NODE_BY_ID, blockedReason, describe, skillPower,
         synergyMultiplier, rankMultiplier, pointsLeft, spentPoints, passiveTotals } from './skilltree.js';

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

  /** One tooltip body for a skill, used by the bar and by the tree. */
  skillTipHtml(nodeId) {
    const s = this.game.state;
    const node = NODE_BY_ID[nodeId];
    const rank = s.ranks[nodeId] || 0;
    const branch = BRANCHES.find(b => b.id === node.branch);
    const head = `
      <div class="tt-name" style="color:${rank ? branch.color : '#8a8a8a'}">${node.name}</div>
      <div class="tt-type">${branch.name} · ${node.kind === 'active' ? 'evne' : 'passiv'} · rang ${rank}/${node.maxRank}</div>`;
    const lines = describe(node, s.ranks, s.level).map(l => `<div class="tt-stat">${l}</div>`).join('');
    let foot = '';
    if (node.kind === 'active') {
      const ability = ABILITY_BY_ID[node.ability];
      const mult = skillPower(nodeId, s.ranks) || rankMultiplier(1) * synergyMultiplier(node, s.ranks);
      const power = abilityPower(ability, mult, this.game.totals());
      foot = `<div class="tt-stat">${ability.text(power)}</div>
        <div class="tt-cmp">${ability.stamina ? `${ability.stamina} udholdenhed · ` : ''}${ability.cooldown}s pause</div>`;
    }
    const why = blockedReason(node, s.level, s.ranks);
    if (why) foot += `<div class="tt-cmp bad">${why}</div>`;
    return head + lines + foot;
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
        ? '<div class="tt-cmp up">▲ Bedre end det du har på</div>'
        : diff < 0 ? '<div class="tt-cmp down">▼ Dårligere end det du har på</div>'
          : '<div class="tt-cmp">Samme som det du har på</div>';
    } else if (equipped && equipped.id === item.id) {
      cmp = '<div class="tt-cmp">Du har den på</div>';
    }
    this.tooltip.innerHTML = `
      <div class="tt-name" style="color:${item.color}">${item.name}</div>
      <div class="tt-type">${item.rarityName} · niveau ${item.level}</div>
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
      this.toast('Alle evnepoint er givet tilbage', 1600);
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
          el.innerHTML = `<div class="sn-icon"><canvas width="96" height="96"></canvas>
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
      this.skillCols.push(col);
    }

    // the eight slots, mirrored from the hotbar
    const bar = $('#skill-bar');
    bar.innerHTML = '';
    this.skillBarEls = [];
    for (let i = 0; i < BAR_SLOTS; i++) {
      const el = document.createElement('div');
      el.className = 'slot ability empty';
      el.innerHTML = `<canvas class="icon" width="96" height="96"></canvas>
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
    if (this.pickedSlot >= 0 && node.kind === 'active' && s.ranks[node.id] > 0) {
      this.game.assignBar(this.pickedSlot, node.id);
      this.pickedSlot = -1;
      this.renderSkills();
      return;
    }
    const why = blockedReason(node, s.level, s.ranks);
    if (why) { this.toast(why, 1400); return; }
    this.game.spendPoint(node.id);
  }

  /** Faint lines from a skill to the ones it needs. Only measurable once the
      panel is on screen, so it is redrawn every time the panel opens. */
  drawSkillLinks() {
    for (const col of this.skillCols) {
      const svg = col.querySelector('.skill-links');
      const base = col.getBoundingClientRect();
      if (!base.width) return;                       // panel is hidden
      svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);
      svg.setAttribute('width', base.width);
      svg.setAttribute('height', base.height);
      const parts = [];
      for (const node of NODES) {
        if (!this.nodeEls[node.id] || !node.requires.length) continue;
        const to = this.nodeEls[node.id].querySelector('.sn-icon').getBoundingClientRect();
        for (const req of node.requires) {
          const from = this.nodeEls[req]?.querySelector('.sn-icon').getBoundingClientRect();
          if (!from) continue;
          const lit = (this.game.state.ranks[req] || 0) > 0 ? ' class="on"' : '';
          parts.push(`<line${lit} x1="${from.x + from.width / 2 - base.x}" y1="${from.bottom - base.y}"`
            + ` x2="${to.x + to.width / 2 - base.x}" y2="${to.y - base.y}" />`);
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
      const reachable = !why || why === 'Ingen point tilbage' || why === 'Maks rang';
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
    this.drawSkillLinks();
    $('#skill-hint').textContent = this.pickedSlot >= 0
      ? `Plads ${this.pickedSlot + 1} valgt — klik på en evne for at lægge den der.`
      : 'Klik på en evne for at bruge et point. Klik på en plads herunder og så på en evne for at flytte den. Højreklik på en plads for at tømme den.';
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
    $('#equipped-name').textContent = w ? w.name : 'Ingen våben';
    $('#equipped-stats').innerHTML = w ? statLines(w).map(s => `<div>${s}</div>`).join('') : '<div>bare næver</div>';
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
      el.innerHTML = item ? '' : `<span class="ph">${{ weapon: 'Våben', armor: 'Rustning', trinket: 'Amulet' }[slot]}</span>`;
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
      <div>Niveau <b>${s.level}</b></div>
      <div>Liv <b>${Math.ceil(s.hp)} / ${t.maxHp}</b></div>
      <div>${STAT_LABEL.skade} <b>${t.damage}</b></div>
      <div>${STAT_LABEL.smidighed} <b>${t.smidighed}</b></div>
      <div>${STAT_LABEL.styrke} <b>${t.styrke}</b></div>
      <div>Kritisk <b>${Math.round(t.crit * 100)}%</b></div>
      <div>Evnepoint <b>${t.skillPoints}</b></div>`;
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
    $('#shop-title').textContent = 'Helbrederen';
    $('#shop-body').innerHTML = `
      <div class="heal-card shop-col">
        <p>Du har <b>${Math.ceil(game.state.hp)} / ${t.maxHp}</b> liv.<br>
        ${missing <= 0 ? 'Du fejler ikke noget.' : `Jeg gør dig hel igen for <b>${cost}</b> guld.`}</p>
        <button class="big" id="heal-btn" ${missing <= 0 || !afford ? 'disabled' : ''}>
          ${missing <= 0 ? 'Du er rask' : afford ? `Hel mig (${cost} guld)` : `Ikke nok guld (${cost})`}
        </button>
      </div>`;
    const btn = $('#heal-btn');
    if (btn) btn.addEventListener('click', () => { game.buyHeal(); this.openHealer(game); });
    this.shop.classList.remove('hidden');
    this.setGold(game.state.gold);
  }

  /** Merchant: his stock on the left, your bag on the right. */
  openMerchant(game) {
    $('#shop-title').textContent = 'Handelsmanden';
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
      <div class="shop-col"><div class="col-label">Til salg</div><div class="shop-list" id="buy-list"></div></div>
      <div class="shop-col"><div class="col-label">Dine ting</div><div class="shop-list" id="sell-list"></div></div>`;
    const buy = $('#buy-list'), sell = $('#sell-list');

    if (!game.stock.length) buy.innerHTML = '<div class="shop-empty">Udsolgt for i dag.</div>';
    for (const item of game.stock) {
      const price = game.buyPrice(item);
      buy.appendChild(row(item, 'Køb', price, game.state.gold >= price,
        () => { game.buyItem(item); this.openMerchant(game); }));
    }
    if (!game.state.bag.length) sell.innerHTML = '<div class="shop-empty">Din taske er tom.</div>';
    for (const item of game.state.bag) {
      sell.appendChild(row(item, 'Sælg', game.sellPrice(item), true,
        () => { game.sellItem(item); this.openMerchant(game); }));
    }
    this.shop.classList.remove('hidden');
    this.setGold(game.state.gold);
  }

  toast(msg, ms = 1600) {
    const el = $('#toast');
    el.textContent = msg;
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
