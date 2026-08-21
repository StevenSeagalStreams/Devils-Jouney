import { drawItemIcon, statLines, itemScore, STAT_LABEL } from './items.js';

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
    $('#hud').appendChild(this.vignette);

    this.enemyBars = new Map();
    this.buildHotbar();
    this.bindPanel();
  }

  /* ---------------- hotbar ---------------- */
  buildHotbar() {
    this.hotbar.innerHTML = '';
    this.hotSlots = [];
    for (let i = 0; i < 7; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `<canvas class="icon" width="96" height="96"></canvas><span class="key">${i + 2}</span>`;
      el.addEventListener('click', () => {
        const item = this.game.state.hotbar[i];
        if (item) this.game.equip(item);
      });
      this.attachTip(el, () => this.game.state.hotbar[i]);
      this.hotbar.appendChild(el);
      this.hotSlots.push(el);
    }
    const eq = $('#equipped-slot');
    eq.querySelector('.key')?.remove();
    this.attachTip(eq, () => this.game.state.equipped.weapon);
  }

  /* ---------------- tooltip ---------------- */
  attachTip(el, getItem) {
    el.addEventListener('mousemove', e => {
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

  toggleInventory(force) {
    const open = force ?? this.inventory.classList.contains('hidden');
    this.inventory.classList.toggle('hidden', !open);
    this.tooltip.style.display = 'none';
    if (open) this.renderBag();
    return open;
  }

  get inventoryOpen() { return !this.inventory.classList.contains('hidden'); }

  /* ---------------- rendering ---------------- */
  renderAll() {
    this.renderEquipped();
    this.renderHotbar();
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
    $('#equipped-name').style.color = w ? w.color : '#bbb';
    $('#equipped-stats').innerHTML = w ? statLines(w).map(s => `<div>${s}</div>`).join('') : '<div>bare næver</div>';
  }

  renderHotbar() {
    this.hotSlots.forEach((el, i) => {
      const item = this.game.state.hotbar[i];
      drawItemIcon(el.querySelector('canvas'), item);
      el.classList.toggle('filled', !!item);
      el.style.setProperty('--rare', item ? item.color : '#383838');
    });
  }

  renderBag() {
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
      <div>${STAT_LABEL.styrke} <b>${t.styrke}</b></div>`;
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
    el.style.left = screen.x + 'px';
    el.style.top = screen.y + 'px';
    this.worldUI.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  enemyBar(id) {
    let bar = this.enemyBars.get(id);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'enemy-bar';
      bar.innerHTML = '<div class="name"></div><div class="fill"></div>';
      this.worldUI.appendChild(bar);
      this.enemyBars.set(id, bar);
    }
    return bar;
  }

  updateEnemyBar(id, { x, y, visible, pct, name }) {
    const bar = this.enemyBar(id);
    bar.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    bar.style.left = x + 'px';
    bar.style.top = y + 'px';
    bar.querySelector('.fill').style.width = Math.max(0, pct * 100) + '%';
    bar.querySelector('.name').textContent = name;
  }

  removeEnemyBar(id) {
    const bar = this.enemyBars.get(id);
    if (bar) { bar.remove(); this.enemyBars.delete(id); }
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
