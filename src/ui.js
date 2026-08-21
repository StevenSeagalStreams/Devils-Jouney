import { drawItemIcon, statLines, itemScore, STAT_LABEL } from './items.js';
import { ABILITIES, abilityPower, drawAbilityIcon } from './abilities.js';

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
  }

  /* ---------------- ability bar ---------------- */
  buildHotbar() {
    this.hotbar.innerHTML = '';
    this.abilitySlots = ABILITIES.map((ability, i) => {
      const el = document.createElement('div');
      el.className = 'slot ability';
      el.innerHTML = `<canvas class="icon" width="96" height="96"></canvas>
        <div class="cd"><span></span></div>
        <div class="lock"></div>
        <span class="key">${ability.key}</span>`;
      el.addEventListener('click', () => this.game.useAbility(i));
      el.addEventListener('mousemove', e => {
        if (document.pointerLockElement) { this.tooltip.style.display = 'none'; return; }
        this.showAbilityTip(ability, e.clientX, e.clientY);
      });
      el.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; });
      this.hotbar.appendChild(el);
      return el;
    });
    this.abilityUnlocked = new Array(ABILITIES.length).fill(null);
    const eq = $('#equipped-slot');
    eq.querySelector('.key')?.remove();
    this.attachTip(eq, () => this.game.state.equipped.weapon);
  }

  showAbilityTip(ability, x, y) {
    const s = this.game.state;
    const locked = s.level < ability.unlock;
    const power = abilityPower(ability, s.level, this.game.totals());
    this.tooltip.innerHTML = `
      <div class="tt-name" style="color:${locked ? '#8a8a8a' : ability.color}">${ability.name}</div>
      <div class="tt-type">Evne · tast ${ability.key}</div>
      <div class="tt-stat">${locked ? `Låses op på niveau ${ability.unlock}` : ability.text(power)}</div>
      <div class="tt-cmp">${ability.stamina ? `${ability.stamina} udholdenhed · ` : ''}${ability.cooldown}s pause</div>`;
    this.tooltip.style.display = 'block';
    const r = this.tooltip.getBoundingClientRect();
    this.tooltip.style.left = Math.min(x + 16, window.innerWidth - r.width - 8) + 'px';
    this.tooltip.style.top = Math.max(8, y - r.height - 12) + 'px';
  }

  /** Cheap per-frame pass: icons are only redrawn when something unlocks. */
  renderAbilities() {
    const s = this.game.state;
    ABILITIES.forEach((ability, i) => {
      const el = this.abilitySlots[i];
      const locked = s.level < ability.unlock;
      if (this.abilityUnlocked[i] !== !locked) {
        this.abilityUnlocked[i] = !locked;
        drawAbilityIcon(el.querySelector('canvas'), ability, locked);
        el.classList.toggle('locked', locked);
        el.style.setProperty('--rare', locked ? '#333' : ability.color);
        el.querySelector('.lock').textContent = locked ? ability.unlock : '';
      }
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
    });
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
