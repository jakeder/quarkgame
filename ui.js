(function () {
  const Q = window.QuarkGame;
  let state = null;
  let passScreenAcknowledged = false;
  const selectedHandCards = new Set();
  const selectedParticles = new Set();

  // Setup screen wiring
  document.getElementById('start').addEventListener('click', startGame);
  document.getElementById('player-count').addEventListener('change', renderNameInputs);
  document.getElementById('pass-continue').addEventListener('click', onPassContinue);
  document.getElementById('new-game').addEventListener('click', () => location.reload());

  // Hand-limit checkbox enables/disables its number input (local + online).
  bindLimitToggle('limit-hand', 'hand-limit');
  bindLimitToggle('online-limit-hand', 'online-hand-limit');

  // Advanced toggle gates the Advanced-only variants and the world picker.
  bindAdvancedToggle({
    adv: 'advanced-mode',
    deps: ['variant-antihero', 'variant-nothingleft'],
    pcCount: 'player-count',
    pickerWrap: 'worlds-picker',
    pickerList: 'worlds-list',
    pickerPrefix: 'world-',
  });
  bindAdvancedToggle({
    adv: 'online-advanced-mode',
    deps: ['online-variant-antihero', 'online-variant-nothingleft'],
  });
  function bindAdvancedToggle({ adv, deps, pcCount, pickerWrap, pickerList, pickerPrefix }) {
    const advEl = document.getElementById(adv);
    if (!advEl) return;
    function refresh() {
      const on = advEl.checked;
      deps.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = !on;
        if (!on) el.checked = false;
      });
      if (pickerWrap) refreshWorldsPicker();
    }
    advEl.addEventListener('change', refresh);
    const anti = document.getElementById('variant-antihero');
    if (anti) anti.addEventListener('change', () => pickerWrap && refreshWorldsPicker());
    if (pcCount) {
      document.getElementById(pcCount).addEventListener('change', () =>
        pickerWrap && refreshWorldsPicker());
    }
    function refreshWorldsPicker() {
      const wrap = document.getElementById(pickerWrap);
      const list = document.getElementById(pickerList);
      const show = advEl.checked && document.getElementById('variant-antihero').checked;
      wrap.hidden = !show;
      if (!show) return;
      const count = parseInt(document.getElementById(pcCount).value, 10);
      list.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'setup-row';
        row.innerHTML =
          '<label>Player ' + (i + 1) + '</label>' +
          '<select id="' + pickerPrefix + i + '">' +
            '<option value="actual">Actual world</option>' +
            '<option value="anti">Anti world</option>' +
          '</select>';
        list.appendChild(row);
      }
    }
  }
  function bindLimitToggle(cbId, numId) {
    const cb = document.getElementById(cbId);
    const num = document.getElementById(numId);
    if (!cb || !num) return;
    cb.addEventListener('change', () => { num.disabled = !cb.checked; });
  }
  function readHandLimit(cbId, numId) {
    const cb = document.getElementById(cbId);
    if (!cb || !cb.checked) return null;
    return clampInt(document.getElementById(numId).value, 1, 20, 7);
  }

  // Game screen wiring
  document.getElementById('synth-particle-btn').addEventListener('click', onSynthParticle);
  document.getElementById('build-atom-btn').addEventListener('click', onBuildAtom);
  document.getElementById('end-synth-btn').addEventListener('click', onEndSynthesis);
  document.getElementById('end-turn-btn').addEventListener('click', onEndTurn);
  document.getElementById('atom-electron-count').addEventListener('input', updateActionButtons);
  document.getElementById('annihilate-btn').addEventListener('click', onAnnihilate);

  // ---------- Settings panel wiring ----------
  const S = window.Settings;
  const settingsBtn   = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const themePicker   = document.getElementById('theme-picker');
  const rememberCB    = document.getElementById('setting-remember-names');
  const resetBtn      = document.getElementById('settings-reset');

  if (!S) console.error('[settings] window.Settings missing — settings.js failed to load before ui.js');
  if (!settingsBtn || !settingsModal) console.error('[settings] DOM nodes missing — index.html may be stale (hard-refresh to bust service worker cache)');

  function refreshSettingsUI() {
    if (!S) return;
    try {
      const cur = S.getAll();
      if (themePicker) {
        themePicker.querySelectorAll('.theme-swatch').forEach(b => {
          b.classList.toggle('active', b.dataset.theme === cur.theme);
        });
      }
      if (rememberCB) rememberCB.checked = !!cur.rememberNames;
    } catch (e) {
      console.error('[settings] refresh failed:', e);
    }
  }

  // Register the click handler BEFORE anything that could throw, so even if
  // refresh/init fails the button still opens the modal.
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      refreshSettingsUI();
      if (!settingsModal) return;
      if (typeof settingsModal.showModal === 'function') {
        try { settingsModal.showModal(); }
        catch (e) { console.error('[settings] showModal failed:', e); settingsModal.setAttribute('open', ''); }
      } else {
        settingsModal.setAttribute('open', '');
      }
    });
  }
  if (themePicker) {
    themePicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-swatch');
      if (!btn || !S) return;
      S.set('theme', btn.dataset.theme);
    });
  }
  if (rememberCB) {
    rememberCB.addEventListener('change', () => {
      if (!S) return;
      S.set('rememberNames', rememberCB.checked);
      if (!rememberCB.checked) S.set('lastNames', []);
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (S && confirm('Reset settings to defaults?')) S.reset();
    });
  }
  if (settingsModal) {
    // Close-on-backdrop-click (the form method=dialog handles the X already).
    settingsModal.addEventListener('click', (e) => {
      const r = settingsModal.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right
                  && e.clientY >= r.top  && e.clientY <= r.bottom;
      if (!inside) settingsModal.close();
    });
  }
  refreshSettingsUI();
  if (S) S.subscribe(refreshSettingsUI);

  renderNameInputs();

  // ---------- Online lobby wiring ----------
  let online = null; // { code, uid, isHost, unsubscribe, lastRoom }

  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => setSetupMode(btn.dataset.mode));
  });
  document.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => setOnlineSubTab(btn.dataset.sub));
  });
  document.getElementById('create-room-btn').addEventListener('click', onCreateRoom);
  document.getElementById('join-room-btn').addEventListener('click', onJoinRoom);
  document.getElementById('lobby-start').addEventListener('click', onStartRoom);
  document.getElementById('lobby-leave').addEventListener('click', onLeaveRoom);

  function setSetupMode(mode) {
    document.querySelectorAll('.mode-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    document.getElementById('setup-local').hidden = mode !== 'local';
    document.getElementById('setup-online').hidden = mode !== 'online';
    if (mode === 'online') checkOnlineReady();
  }

  function setOnlineSubTab(sub) {
    document.querySelectorAll('.sub-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.sub === sub));
    document.getElementById('online-create').hidden = sub !== 'create';
    document.getElementById('online-join').hidden = sub !== 'join';
    hideOnlineError();
  }

  async function checkOnlineReady() {
    const status = document.getElementById('online-status');
    status.textContent = 'Connecting to Firebase…';
    const mp = await window.MultiplayerReady;
    if (!mp.ready) {
      status.textContent = mp.error || 'Online play unavailable.';
      status.classList.add('error');
      return false;
    }
    status.textContent = '';
    status.classList.remove('error');
    return true;
  }

  async function onCreateRoom() {
    hideOnlineError();
    const name = (document.getElementById('online-host-name').value || '').trim() || 'Host';
    const drawSize  = clampInt(document.getElementById('online-draw-size').value, 1, 10, 3);
    const maxRounds = clampInt(document.getElementById('online-max-rounds').value, 3, 20, 10);
    const advanced = document.getElementById('online-advanced-mode').checked;
    const variants = {
      pauli:       document.getElementById('online-variant-pauli').checked,
      heliumPrize: document.getElementById('online-variant-helium').checked,
      antiHero:    document.getElementById('online-variant-antihero').checked,
      nothingLeft: document.getElementById('online-variant-nothingleft').checked,
    };
    const handLimit = readHandLimit('online-limit-hand', 'online-hand-limit');
    const hostConfig = { drawSize, maxRounds, handLimit, advanced, variants };
    const mp = await window.MultiplayerReady;
    if (!mp.ready) return showOnlineError(mp.error);
    try {
      // Publish advanced + variants to the room so guests get the right lobby
      // pickers; the full config still rides in hostConfig for createGame.
      const { code, uid } = await mp.createRoom(name, { advanced, variants });
      enterLobby(code, uid, true, hostConfig);
    } catch (e) {
      showOnlineError(e.message || String(e));
    }
  }

  async function onJoinRoom() {
    hideOnlineError();
    const code = (document.getElementById('online-room-code').value || '').toUpperCase().trim();
    const name = (document.getElementById('online-join-name').value || '').trim() || 'Player';
    if (!code) return showOnlineError('Enter a room code.');
    const mp = await window.MultiplayerReady;
    if (!mp.ready) return showOnlineError(mp.error);
    try {
      const result = await mp.joinRoom(code, name);
      enterLobby(result.code, result.uid, false, null);
    } catch (e) {
      showOnlineError(e.message || String(e));
    }
  }

  function enterLobby(code, uid, isHost, hostConfig) {
    online = { code, uid, isHost, hostConfig, unsubscribe: null, lastRoom: null };
    document.getElementById('setup').hidden = true;
    document.getElementById('lobby').hidden = false;
    document.getElementById('lobby-code').textContent = code;
    document.getElementById('lobby-start').hidden = !isHost;
    document.getElementById('lobby-host-note').hidden = isHost;
    window.MultiplayerReady.then(mp => {
      online.unsubscribe = mp.subscribeToRoom(code, onRoomUpdate);
    });
  }

  function onRoomUpdate(room) {
    if (!online || !room) return;
    online.lastRoom = room;
    if (room.started && room.state) {
      enterOnlineGame(room.state);
    } else {
      renderLobbyView(room);
    }
  }

  function renderLobbyView(room) {
    const players = room.players || {};
    const cfg = room.config || {};
    const antiHero = !!(cfg.advanced && cfg.variants && cfg.variants.antiHero);
    const list = document.getElementById('lobby-players');
    list.innerHTML = '';
    Object.entries(players)
      .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
      .forEach(([pid, p]) => {
        const li = document.createElement('li');
        const isHost = pid === room.hostUid;
        const isYou  = pid === online.uid;
        const worldBadge = antiHero
          ? '<span class="badge world">' + (p.world === 'anti' ? 'anti world' : 'actual world') + '</span>'
          : '';
        li.innerHTML =
          '<span>' + escapeHtml(p.name) + '</span>' +
          (isHost ? '<span class="badge">host</span>' : '') +
          (isYou ? '<span class="badge you">you</span>' : '') +
          worldBadge;
        list.appendChild(li);
      });
    renderWorldPicker(antiHero, players);
    document.getElementById('lobby-start').disabled = Object.keys(players).length < 2;
  }

  // Anti Hero (online): each player picks their own world in the lobby.
  function renderWorldPicker(antiHero, players) {
    const wrap = document.getElementById('lobby-world');
    if (!wrap) return;
    if (!antiHero) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const mine = players[online.uid] || {};
    const cur = mine.world === 'anti' ? 'anti' : 'actual';
    wrap.innerHTML =
      '<h3>Your world (Anti Hero)</h3>' +
      '<div class="world-choice">' +
        '<button type="button" class="world-btn' + (cur === 'actual' ? ' active' : '') + '" data-world="actual">Actual world</button>' +
        '<button type="button" class="world-btn' + (cur === 'anti' ? ' active' : '') + '" data-world="anti">Anti world</button>' +
      '</div>';
    wrap.querySelectorAll('.world-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mp = await window.MultiplayerReady;
        try { await mp.setPlayerWorld(online.code, online.uid, btn.dataset.world); } catch (_) {}
      });
    });
  }

  function enterOnlineGame(stateJson) {
    let next;
    try {
      next = typeof stateJson === 'string' ? JSON.parse(stateJson) : stateJson;
    } catch (e) {
      console.error('Failed to parse room state:', e);
      return;
    }
    state = next;
    document.getElementById('setup').hidden = true;
    document.getElementById('lobby').hidden = true;
    passScreenAcknowledged = true; // no pass screen in online play
    clearSelections();
    renderRulesRef();
    render();
  }

  async function onStartRoom() {
    if (!online || !online.isHost || !online.lastRoom) return;
    const sortedPlayers = Object.entries(online.lastRoom.players || {})
      .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
    const names = sortedPlayers.map(([, p]) => p.name);
    const uids  = sortedPlayers.map(([uid]) => uid);
    if (names.length < 2) return;
    const mp = await window.MultiplayerReady;
    // Assemble per-player worlds from their lobby choices (Anti Hero).
    const worlds = sortedPlayers.map(([, p]) => p.world === 'anti' ? 'anti' : 'actual');
    const cfg = { ...(online.hostConfig || {}), worlds };
    const initial = Q.createGame(names, cfg);
    // Stamp player uids so every client can identify itself in the synced state.
    initial.players.forEach((p, i) => { p.uid = uids[i]; });
    await mp.startRoom(online.code, initial);
  }

  // ---------- Online helpers ----------
  function isOnline() { return !!online; }
  function localPlayerIndex() {
    if (!online || !state || !state.players) return -1;
    return state.players.findIndex(p => p.uid === online.uid);
  }
  function isMyTurn() {
    if (!online) return true;
    return state && state.currentPlayer === localPlayerIndex();
  }
  async function syncState() {
    if (!online) return;
    try {
      const mp = await window.MultiplayerReady;
      await mp.writeState(online.code, state);
    } catch (e) {
      showSynthError('Sync failed: ' + (e.message || e));
    }
  }

  async function onLeaveRoom() {
    if (!online) return;
    const mp = await window.MultiplayerReady;
    if (online.unsubscribe) online.unsubscribe();
    try { await mp.leaveRoom(online.code, online.uid); } catch (_) {}
    online = null;
    document.getElementById('lobby').hidden = true;
    document.getElementById('setup').hidden = false;
  }

  function showOnlineError(msg) {
    const el = document.getElementById('online-error');
    el.textContent = msg;
    el.hidden = false;
  }
  function hideOnlineError() {
    document.getElementById('online-error').hidden = true;
  }

  // ---------- Setup ----------

  function renderNameInputs() {
    const count = parseInt(document.getElementById('player-count').value, 10);
    const wrap = document.getElementById('player-names');
    wrap.innerHTML = '';
    const remembered = S.get('rememberNames') ? (S.get('lastNames') || []) : [];
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'setup-row';
      const saved = remembered[i] || '';
      row.innerHTML =
        '<label for="p' + i + '">Player ' + (i + 1) + '</label>' +
        '<input id="p' + i + '" type="text" placeholder="Name" value="' +
        escapeHtmlAttr(saved) + '" />';
      wrap.appendChild(row);
    }
  }

  function escapeHtmlAttr(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function startGame() {
    const count     = parseInt(document.getElementById('player-count').value, 10);
    const drawSize  = clampInt(document.getElementById('draw-size').value, 1, 10, 3);
    const maxRounds = clampInt(document.getElementById('max-rounds').value, 3, 20, 10);
    const names = [];
    const rawNames = [];
    for (let i = 0; i < count; i++) {
      const input = document.getElementById('p' + i);
      const raw = input ? input.value.trim() : '';
      rawNames.push(raw);
      names.push(raw || 'Player ' + (i + 1));
    }
    if (S.get('rememberNames')) S.set('lastNames', rawNames);
    const advanced = document.getElementById('advanced-mode').checked;
    const variants = {
      pauli:       document.getElementById('variant-pauli').checked,
      heliumPrize: document.getElementById('variant-helium').checked,
      antiHero:    document.getElementById('variant-antihero').checked,
      nothingLeft: document.getElementById('variant-nothingleft').checked,
    };
    const handLimit = readHandLimit('limit-hand', 'hand-limit');
    const worlds = (advanced && variants.antiHero)
      ? Array.from({ length: count }, (_, i) => (document.getElementById('world-' + i) || { value: 'actual' }).value)
      : null;
    state = Q.createGame(names, { drawSize, maxRounds, handLimit, advanced, variants, worlds });
    passScreenAcknowledged = true; // first player goes straight in
    clearSelections();
    document.getElementById('setup').hidden = true;
    document.getElementById('max-rounds-display').textContent = String(maxRounds);
    renderRulesRef();
    render();
  }

  // ---------- Recipe reference sidebar ----------

  function renderRulesRef() {
    const wrap = document.getElementById('rules-ref');
    if (!wrap || wrap.dataset.rendered) return;
    wrap.dataset.rendered = '1';
    const adv = !!(state.config && state.config.advanced);

    const particleItem = (rule) => {
      const spin = rule.spin === 'aligned' ? 'all same spin' : 'mixed spins';
      return '<li class="ref-item' + (rule.stable ? '' : ' unstable') + (rule.anti ? ' anti' : '') + '">' +
        '<div class="ref-head">' + escapeHtml(Q.PARTICLE_LABEL[rule.type]) + '</div>' +
        '<div class="ref-line">' + formatFlavorRecipe(rule.flavors, rule.anti) + ' · ' + spin + '</div>' +
        '<div class="ref-line ref-energy">' + Q.formatEnergy(rule.energy) + ' · ' + describeDecay(rule) + '</div>' +
      '</li>';
    };
    const particles = Q.PARTICLE_RULES.filter(r => adv || !r.anti).map(particleItem).join('');

    // Pions (Advanced): group MESON_RULES by type so pi0's two recipes merge.
    let pions = '';
    if (adv) {
      const byType = {};
      for (const m of Q.MESON_RULES) {
        (byType[m.type] = byType[m.type] || []).push(m);
      }
      pions = Object.keys(byType).map(type => {
        const rules = byType[type];
        const recipe = rules.map(m =>
          m.q.flavor + ' + ' + m.aq.flavor + '̄').join(' or ');
        const d = rules[0].decay;
        const decayTxt = d.positrons ? '→ e⁺' : d.electrons ? '→ e⁻' : '→ nothing';
        return '<li class="ref-item unstable">' +
          '<div class="ref-head">' + escapeHtml(Q.PARTICLE_LABEL[type]) + '</div>' +
          '<div class="ref-line">' + recipe + ' · diff. spins · matching colors</div>' +
          '<div class="ref-line ref-energy">' + Q.formatEnergy(rules[0].energy) + ' · decays this turn ' + decayTxt + '</div>' +
        '</li>';
      }).join('');
    }

    const atoms = Q.ATOM_RULES.filter(r => adv || !r.anti).map(rule => {
      const spinLbl = describeSpinSum(rule);
      const stable = rule.stable ? 'stable'
        : (rule.anti ? 'unstable → ³H̄e + e⁺' : 'unstable → ³He + e⁻');
      return '<li class="ref-item' + (rule.stable ? '' : ' unstable') + (rule.anti ? ' anti' : '') + '">' +
        '<div class="ref-head">' + escapeHtml(Q.ATOM_LABEL[rule.type]) + '</div>' +
        '<div class="ref-line">' + atomRecipe(rule) + (spinLbl ? ' · ' + spinLbl : '') + '</div>' +
        '<div class="ref-line ref-energy">' + Q.formatEnergy(rule.energy) + ' · ' + stable + '</div>' +
      '</li>';
    }).join('');

    const advRules = adv ? (
      '<li><strong>Pions</strong>: 1 quark + 1 anti-quark of a matching color (red + anti-red ⇒ colorless) with different spins. They auto-decay at end of turn.</li>' +
      '<li><strong>Anti-baryons / anti-atoms</strong> mirror their matter versions; build anti-atoms with positrons in place of electrons.</li>'
    ) : '';

    wrap.innerHTML =
      '<h2>Reference</h2>' +
      '<div class="ref-block">' +
        '<h3>Particles</h3>' +
        '<ul class="ref-list">' + particles + '</ul>' +
      '</div>' +
      (pions ? (
        '<div class="ref-block">' +
          '<h3>Pions</h3>' +
          '<ul class="ref-list">' + pions + '</ul>' +
        '</div>'
      ) : '') +
      '<div class="ref-block">' +
        '<h3>Atoms</h3>' +
        '<ul class="ref-list">' + atoms + '</ul>' +
      '</div>' +
      '<div class="ref-block">' +
        '<h3>Rules</h3>' +
        '<ul class="ref-rules">' +
          '<li>Particles need <strong>1R + 1G + 1B</strong> (Gell-Mann’s Gimmick).</li>' +
          '<li><strong>Mixed</strong> = at least one ↑ and one ↓. <strong>Aligned</strong> = all ↑ or all ↓.</li>' +
          '<li>Unstable particles decay at turn end. Free neutrons get a Schrödinger’s Cat marker and decay at the end of your next turn.</li>' +
          '<li>Tritium may be voluntarily decayed for ³He + e⁻.</li>' +
          advRules +
          '<li>End of game: each e⁻ + e⁺ pair annihilates for ' + Q.formatEnergy(Q.ANNIHILATION_ENERGY) + '.</li>' +
        '</ul>' +
      '</div>';
  }

  function formatFlavorRecipe(flavors, anti) {
    const bar = anti ? '̄' : '';
    const parts = [];
    if (flavors.u) parts.push(flavors.u + 'u' + bar);
    if (flavors.d) parts.push(flavors.d + 'd' + bar);
    return parts.join(' + ');
  }

  function atomRecipe(rule) {
    const pp = rule.anti ? 'p̄' : 'p';
    const nn = rule.anti ? 'n̄' : 'n';
    const lep = rule.anti ? 'e⁺' : 'e⁻';
    const parts = [];
    if (rule.protons)  parts.push(rule.protons + pp);
    if (rule.neutrons) parts.push(rule.neutrons + nn);
    return parts.join(' + ') + ' · ' + rule.electrons + ' ' + lep;
  }

  function describeDecay(rule) {
    if (rule.stable) return 'stable';
    if (!rule.decay) return 'unstable';
    const out = [rule.anti ? '→ p̄⁻' : '→ p⁺'];
    if (rule.decay.electrons === 1) out.push('+ e⁻');
    else if (rule.decay.electrons > 1) out.push('+ ' + rule.decay.electrons + ' e⁻');
    if (rule.decay.positrons === 1) out.push('+ e⁺');
    else if (rule.decay.positrons > 1) out.push('+ ' + rule.decay.positrons + ' e⁺');
    if (rule.decay.delayed) out.push('(delayed)');
    return out.join(' ');
  }

  function describeSpinSum(rule) {
    // Probe spinSumCheck across the plausible integer range so the sidebar
    // stays in sync with the rules engine.
    const valid = [];
    for (let s = -12; s <= 12; s++) {
      if (rule.spinSumCheck(s)) valid.push(s);
    }
    if (valid.length >= 25) return ''; // unconstrained (H)
    if (valid.length === 1) return 'spin sum = ' + signed(valid[0]);
    if (valid.length === 2 && valid[0] === -valid[1]) return 'spin sum = ±' + valid[1];
    return 'spin sum ∈ {' + valid.map(signed).join(', ') + '}';
  }

  function signed(n) { return n > 0 ? '+' + n : String(n); }

  function particleSpinSum(particle) {
    return particle.cards.reduce((sum, c) => sum + (c.spin === 'up' ? 1 : -1), 0);
  }

  function renderTurnBanner(currentP) {
    const banner = document.getElementById('turn-banner');
    if (!banner) return;
    const phaseWord = state.phase === 'synthesize' ? 'synthesize'
      : state.phase === 'decays' ? 'process decays'
      : 'play';
    if (online) {
      if (isMyTurn()) {
        banner.className = 'turn-banner your-turn';
        banner.innerHTML = '<span class="banner-dot"></span>Your turn — ' + escapeHtml(phaseWord);
      } else {
        banner.className = 'turn-banner waiting';
        banner.innerHTML = '<span class="banner-dot pulse"></span>Waiting for ' +
          escapeHtml(currentP.name) + ' to ' + escapeHtml(phaseWord) + '…';
      }
    } else {
      // Pass-and-play: whoever is at the device is the active player.
      banner.className = 'turn-banner local-turn';
      banner.innerHTML = '<span class="banner-dot"></span>' +
        escapeHtml(currentP.name) + "'s turn — " + escapeHtml(phaseWord);
    }
  }

  function renderEnergyLedger(player) {
    const wrap = document.getElementById('energy-ledger');
    if (!wrap) return;
    const buckets = aggregateEnergyLog(player.log);
    const rows = buckets.length === 0
      ? '<div class="ledger-empty">No energy collected yet.</div>'
      : buckets.map(b => {
          const neg = b.total < 0;
          const amt = (neg ? '−' : '+') + Q.formatEnergy(Math.abs(b.total));
          return '<div class="ledger-row">' +
            '<span class="ledger-label">' + escapeHtml(b.label) + '</span>' +
            '<span class="ledger-count">×' + b.count + '</span>' +
            '<span class="ledger-amount' + (neg ? ' negative' : '') + '">' + amt + '</span>' +
          '</div>';
        }).join('');
    const total = Q.formatEnergy(player.energy);
    const [num, unit] = total.split(' ');
    wrap.innerHTML =
      '<h2>Binding Energy</h2>' +
      '<div class="ledger-total tabular">' + num +
        '<span class="ledger-unit">' + (unit || '') + '</span>' +
      '</div>' +
      '<div class="ledger-rows">' + rows + '</div>';
  }

  function aggregateEnergyLog(log) {
    const buckets = new Map();
    for (const event of log) {
      let key, label;
      if (event.kind === 'synth-particle') {
        key = 'p:' + event.particleType;
        label = shortName(Q.PARTICLE_LABEL[event.particleType]) + ' synthesis';
      } else if (event.kind === 'synth-atom') {
        key = 'a:' + event.atomType;
        label = shortName(Q.ATOM_LABEL[event.atomType]) + ' formation';
      } else if (event.kind === 'annihilation') {
        key = 'annihilation';
        label = 'e⁻/e⁺ annihilation';
      } else if (event.kind === 'pauli-penalty') {
        key = 'pauli-penalty';
        label = 'Pauli Penalty';
      } else {
        continue;
      }
      if (!buckets.has(key)) buckets.set(key, { label, count: 0, total: 0 });
      const b = buckets.get(key);
      b.count += (event.pairs || 1);
      b.total += (event.energy || 0);
    }
    return [...buckets.values()];
  }

  // "Proton (p⁺)" → "Proton"
  function shortName(label) {
    if (!label) return '';
    const i = label.indexOf(' (');
    return i === -1 ? label : label.slice(0, i);
  }

  function clampInt(v, lo, hi, fallback) {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
  }

  // ---------- Render dispatch ----------

  function render() {
    if (!state) return;
    const gameOver = state.phase === 'over';
    // Online mode skips the pass screen — there's no device handoff.
    const passNeeded = !online && !passScreenAcknowledged && state.phase === 'between';
    document.getElementById('game').hidden       = gameOver || passNeeded;
    document.getElementById('pass-screen').hidden = !passNeeded;
    document.getElementById('game-over').hidden  = !gameOver;
    if (gameOver) return renderGameOver();
    if (passNeeded) return renderPassScreen();
    renderTurn();
  }

  function renderPassScreen() {
    document.getElementById('pass-text').textContent =
      'Pass device to ' + Q.currentPlayer(state).name;
    // Round just ended iff we're between turns with currentPlayer wrapped back
    // to 0 and we're past round 1 (round 1 player 1 is the game's opening pass).
    const recap = document.getElementById('round-recap');
    if (state.currentPlayer === 0 && state.round > 1) {
      document.getElementById('round-recap-title').textContent =
        'Round ' + (state.round - 1) + ' complete · standings';
      renderRecapBody();
      recap.hidden = false;
    } else {
      recap.hidden = true;
    }
  }

  function renderRecapBody() {
    const tbody = document.getElementById('round-recap-body');
    tbody.innerHTML = '';
    rankedPlayers().forEach(p => {
      const tr = document.createElement('tr');
      const atomsCell = variantsOn().heliumPrize
        ? p.stockpile.atoms.length + ' (' + Q.heliumCount(p) + ' He)'
        : String(p.stockpile.atoms.length);
      tr.innerHTML =
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + Q.formatEnergy(p.energy) + '</td>' +
        '<td>' + atomsCell + '</td>' +
        '<td>' + p.stockpile.particles.length + '</td>';
      tbody.appendChild(tr);
    });
  }

  function onPassContinue() {
    Q.beginTurn(state);
    passScreenAcknowledged = true;
    clearSelections();
    render();
  }

  // ---------- Turn screen ----------

  function renderTurn() {
    const currentP = Q.currentPlayer(state);
    // In online play, each client always sees its own hand/stockpile, even
    // when the active turn belongs to someone else.
    const localIdx = online ? localPlayerIndex() : state.currentPlayer;
    const viewP = (localIdx >= 0 && state.players[localIdx]) ? state.players[localIdx] : currentP;

    renderTurnBanner(currentP);
    document.getElementById('game').classList.toggle('waiting', online && !isMyTurn());
    document.getElementById('round-number').textContent = state.round;
    document.getElementById('max-rounds-display').textContent = state.config.maxRounds;
    document.getElementById('deck-count').textContent = state.deck.length;

    const chip = document.getElementById('phase-chip');
    chip.textContent = state.phase === 'synthesize' ? 'Synthesize' : 'Decays';
    chip.className = 'phase-chip phase-' + state.phase;

    renderHand(viewP);
    renderStockpile(viewP);
    renderDecays();
    renderEnergyLedger(viewP);
    renderVariantBadges();
    renderPauliReadout(viewP);
    renderDiscardBanner();
    updateActionButtons();

    const synthing = state.phase === 'synthesize';
    document.getElementById('synth-group-synthesize').hidden = !synthing;
    document.getElementById('end-turn-btn').hidden = synthing;
    document.getElementById('decays-section').hidden = synthing;
  }

  function variantsOn() { return (state && state.config && state.config.variants) || {}; }

  function renderVariantBadges() {
    const wrap = document.getElementById('variant-badges');
    const v = variantsOn();
    const active = Object.keys(Q.VARIANT_LABEL).filter(k => v[k]);
    wrap.innerHTML = active
      .map(k => '<span class="variant-badge" title="' + escapeHtmlAttr(Q.VARIANT_DESC[k]) + '">' +
                escapeHtml(Q.VARIANT_LABEL[k]) + '</span>')
      .join('');
  }

  // Live Pauli readout: how much you'd pay if you ended the turn right now.
  function renderPauliReadout(viewP) {
    const el = document.getElementById('pauli-readout');
    if (!variantsOn().pauli) { el.hidden = true; return; }
    const n = Q.freeChargeCount(viewP);
    const penalty = Q.pauliPenalty(n);
    const canReduce = (!online || isMyTurn()) && state.phase === 'synthesize';
    el.hidden = false;
    el.className = 'pauli-readout' + (penalty > 0 ? ' charged' : '');
    el.innerHTML =
      '<strong>Pauli Penalty</strong> — ' + n + ' free charge' + (n === 1 ? '' : 's') +
      ' in stockpile · ending now costs <strong>' + Q.formatEnergy(penalty) + '</strong>' +
      (penalty > 0 && canReduce ? ' <span class="muted">(annihilate e⁻e⁺ or make H⁻ to reduce)</span>' : '');
  }

  async function onAnnihilate() {
    if (!isMyTurn()) return;
    const r = Q.annihilatePair(state);
    if (!r.ok) return showSynthError(r.error);
    hideSynthError();
    if (online) { await syncState(); return; }
    render();
  }

  // Discard-to-hand-limit prompt (shown in the decays phase when over limit).
  function renderDiscardBanner() {
    const el = document.getElementById('discard-banner');
    const lim = Q.handLimitOf(state);
    const over = Q.discardRequired(state);
    if (lim == null || state.phase !== 'decays' || over <= 0) { el.hidden = true; return; }
    el.hidden = false;
    const mine = !online || isMyTurn();
    el.innerHTML = mine
      ? 'Over hand limit (' + lim + ') — discard <strong>' + over + '</strong> more card' +
        (over === 1 ? '' : 's') + ' <span class="muted">(click cards in your hand to discard)</span>'
      : 'Waiting for ' + escapeHtml(Q.currentPlayer(state).name) + ' to discard ' + over +
        ' to the hand limit (' + lim + ').';
  }

  async function onDiscardCard(cardId) {
    if (!isMyTurn()) return;
    const r = Q.discardCard(state, cardId);
    if (!r.ok) return showSynthError(r.error);
    hideSynthError();
    if (online) { await syncState(); return; }
    render();
  }

  function renderHand(player) {
    const wrap = document.getElementById('hand');
    wrap.innerHTML = '';
    // Discard mode: end of turn (decays phase), over the hand limit, my turn.
    const discardMode = state.phase === 'decays' && Q.discardRequired(state) > 0 && isMyTurn();
    wrap.classList.toggle('discardable', discardMode);
    const lim = Q.handLimitOf(state);
    const limNote = lim != null ? ', limit ' + lim : '';
    document.getElementById('hand-info').textContent =
      player.hand.length === 0
        ? '(empty)'
        : discardMode
          ? '(' + player.hand.length + ' cards' + limNote + ' — click to discard)'
          : '(' + player.hand.length + ' cards' + limNote + ', click to select for particle synthesis)';
    if (player.hand.length === 0) return;
    for (const card of player.hand) {
      const el = renderCard(card, selectedHandCards.has(card.id));
      if (discardMode) el.classList.add('discard-target');
      el.addEventListener('click', () => {
        if (state.phase === 'decays') {
          if (Q.discardRequired(state) > 0) onDiscardCard(card.id);
          return;
        }
        if (state.phase !== 'synthesize') return;
        if (!isMyTurn()) return;
        if (selectedHandCards.has(card.id)) selectedHandCards.delete(card.id);
        else selectedHandCards.add(card.id);
        renderHand(player);
        updateActionButtons();
      });
      wrap.appendChild(el);
    }
  }

  function renderCard(card, selected) {
    const el = document.createElement('div');
    el.className = 'card flavor-' + card.flavor + ' color-' + card.color +
                   (selected ? ' selected' : '') + (card.synthetic ? ' synthetic' : '') +
                   (card.anti ? ' anti' : '');
    // Anti-quarks: an overbar on the flavor letter, "aR"/"aG"/"aB" color tag.
    const symbol = card.anti ? card.flavor + '̄' : card.flavor;
    const charge = card.anti
      ? (card.flavor === 'u' ? '−2/3' : '+1/3')
      : Q.FLAVOR_CHARGE[card.flavor];
    el.innerHTML =
      '<div class="card-charge">' + charge + '</div>' +
      '<div class="card-symbol">' + symbol + '</div>' +
      '<div class="card-spin">' + Q.SPIN_GLYPH[card.spin] + '</div>';
    el.title = Q.describeCard(card);
    return el;
  }

  function renderStockpile(player) {
    document.getElementById('electron-count').textContent = player.stockpile.electrons;
    document.getElementById('positron-count').textContent = player.stockpile.positrons;
    // Pauli amendment 1: annihilate-on-demand button.
    const annBtn = document.getElementById('annihilate-btn');
    const canAnnihilate = variantsOn().pauli && state.phase === 'synthesize' && isMyTurn()
      && player.stockpile.electrons > 0 && player.stockpile.positrons > 0;
    annBtn.hidden = !(variantsOn().pauli && state.phase === 'synthesize');
    annBtn.disabled = !canAnnihilate;
    renderParticles(player);
    renderAtoms(player);
  }

  function renderParticles(player) {
    const wrap = document.getElementById('particles');
    wrap.innerHTML = '';
    if (player.stockpile.particles.length === 0) {
      wrap.innerHTML = '<p class="muted">No free particles yet.</p>';
      return;
    }
    for (const particle of player.stockpile.particles) {
      const tile = renderParticleTile(particle);
      tile.addEventListener('click', () => {
        if (state.phase !== 'synthesize') return;
        if (!isMyTurn()) return;
        if (selectedParticles.has(particle.id)) selectedParticles.delete(particle.id);
        else selectedParticles.add(particle.id);
        renderParticles(player);
        updateActionButtons();
      });
      wrap.appendChild(tile);
    }
  }

  function renderParticleTile(particle) {
    const selected = selectedParticles.has(particle.id);
    const el = document.createElement('div');
    const isMeson = /^pi/.test(particle.type);
    const baryonRule = Q.PARTICLE_RULES.find(r => r.type === particle.type);
    const mesonRule  = isMeson ? Q.MESON_RULES.find(r => r.type === particle.type) : null;
    const rule = baryonRule || mesonRule || { energy: 0, stable: true };
    const stable = isMeson ? false : (baryonRule ? baryonRule.stable : true);
    el.className = 'tile particle ' + particle.type.replace(/[+\-]/g, '-')
      + (selected ? ' selected' : '') + (particle.synthetic ? ' synthetic' : '')
      + (isMeson ? ' pi' : '')
      + (rule.anti ? ' anti' : '')
      + (!stable ? ' unstable' : '');
    const cards = particle.cards.map(c => {
      const sym = c.anti ? c.flavor + '̄' : c.flavor;
      return '<span class="mini-card flavor-' + c.flavor + ' color-' + c.color + '">' +
        sym + Q.SPIN_GLYPH[c.spin] + '</span>';
    }).join('');
    el.innerHTML =
      '<div class="tile-head"><strong>' + Q.PARTICLE_LABEL[particle.type] + '</strong>' +
      (particle.catMarker ? ' <span class="cat" title="Schrödinger\'s Cat: decays at end of your next turn">🐈‍⬛</span>' : '') +
      '</div>' +
      '<div class="tile-cards">' + cards + '</div>' +
      '<div class="tile-energy">' + Q.formatEnergy(rule.energy) +
        ' · spin ' + signed(particleSpinSum(particle)) +
        (isMeson ? ' · decays this turn' : '') + '</div>';
    return el;
  }

  function renderAtoms(player) {
    const wrap = document.getElementById('atoms');
    wrap.innerHTML = '';
    if (player.stockpile.atoms.length === 0) {
      wrap.innerHTML = '<p class="muted">No atoms yet.</p>';
      return;
    }
    for (const atom of player.stockpile.atoms) {
      wrap.appendChild(renderAtomTile(atom));
    }
  }

  function renderAtomTile(atom) {
    const el = document.createElement('div');
    const rule = Q.ATOM_RULES.find(r => r.type === atom.type);
    const isAnion = atom.type === 'H' && atom.anion;
    el.className = 'tile atom atom-' + atom.type +
      (rule && !rule.stable ? ' unstable' : '') + (isAnion ? ' anion' : '');
    const partGlyph = (t) => ({
      proton: 'p⁺', neutron: 'n⁰', antiproton: 'p̄⁻', antineutron: 'n̄⁰',
    })[t] || t;
    const parts = atom.particles.map(p =>
      '<span class="mini-particle">' + partGlyph(p.type) + '</span>'
    ).join('');
    const isAnti = !!(rule && rule.anti);
    const eCount = atom.electrons + (isAnion ? 1 : 0);
    const lepGlyph = isAnti ? 'e⁺' : 'e⁻';
    const electrons = '<span class="mini-electron">' + lepGlyph + ' × ' + eCount + '</span>';
    const label = Q.ATOM_LABEL[atom.type] + (isAnion ? ' → H⁻' : '');
    el.innerHTML =
      '<div class="tile-head"><strong>' + label + '</strong></div>' +
      '<div class="tile-particles">' + parts + ' ' + electrons + '</div>' +
      '<div class="tile-energy">' + Q.formatEnergy(atom.energy) + '</div>';
    if (atom.type === 'T' && state.phase === 'synthesize') {
      const btn = document.createElement('button');
      btn.className = 'tritium-decay';
      btn.textContent = 'Decay (→ He-3 + e⁻)';
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!isMyTurn()) return showSynthError("It's not your turn.");
        const r = Q.decayTritium(state, atom.id);
        if (!r.ok) return showSynthError(r.error);
        if (online) { await syncState(); return; }
        render();
      });
      el.appendChild(btn);
    }
    // Pauli amendment 2: toggle H ↔ H⁻ anion.
    if (atom.type === 'H' && variantsOn().pauli && state.phase === 'synthesize') {
      const btn = document.createElement('button');
      btn.className = 'anion-toggle';
      btn.textContent = isAnion ? 'Remove e⁻ (H⁻ → H)' : 'Add e⁻ (→ H⁻)';
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!isMyTurn()) return showSynthError("It's not your turn.");
        const r = Q.toggleAnion(state, atom.id);
        if (!r.ok) return showSynthError(r.error);
        hideSynthError();
        if (online) { await syncState(); return; }
        render();
      });
      el.appendChild(btn);
    }
    return el;
  }

  function renderDecays() {
    const wrap = document.getElementById('decay-log');
    wrap.innerHTML = '';
    if (state.phase !== 'decays') return;
    if (state.lastDecayEvents.length === 0) {
      wrap.innerHTML = '<p class="muted">No decays this turn.</p>';
      return;
    }
    for (const ev of state.lastDecayEvents) {
      const div = document.createElement('div');
      div.className = 'decay-event';
      if (ev.kind === 'decay') {
        const gained = [];
        if (ev.gainedElectrons) gained.push(ev.gainedElectrons + ' e⁻');
        if (ev.gainedPositrons) gained.push(ev.gainedPositrons + ' e⁺');
        div.textContent = labelFor(ev.from) + ' → Proton' +
          (gained.length ? ' + ' + gained.join(' + ') : '');
      } else if (ev.kind === 'cat-marker') {
        div.textContent = '🐈‍⬛ Schrödinger\'s Cat placed on a free Neutron — it will decay at the end of your next turn if still unbound.';
      }
      wrap.appendChild(div);
    }
  }

  function labelFor(type) {
    return Q.PARTICLE_LABEL[type] || type;
  }

  // ---------- Actions ----------

  function updateActionButtons() {
    const synthBtn = document.getElementById('synth-particle-btn');
    const atomBtn = document.getElementById('build-atom-btn');
    const synthing = state && state.phase === 'synthesize';
    const myTurn = isMyTurn();
    const adv = !!(state && state.config && state.config.advanced);
    const n = selectedHandCards.size;
    const validCount = adv ? (n === 2 || n === 3) : (n === 3);
    synthBtn.disabled = !synthing || !myTurn || !validCount;
    if (n === 3) {
      synthBtn.textContent = 'Synthesize baryon from 3 selected cards';
    } else if (adv && n === 2) {
      synthBtn.textContent = 'Synthesize pion from 2 selected cards';
    } else {
      synthBtn.textContent = adv
        ? 'Synthesize particle (2 for pion, 3 for baryon · ' + n + ' selected)'
        : 'Synthesize particle (need 3 cards, ' + n + ' selected)';
    }
    atomBtn.disabled = !synthing || !myTurn || selectedParticles.size === 0;
    atomBtn.textContent = selectedParticles.size === 0
      ? 'Build atom from selected particles'
      : 'Build atom from ' + selectedParticles.size + ' particle' + (selectedParticles.size === 1 ? '' : 's');
    document.getElementById('end-synth-btn').disabled = !synthing || !myTurn;
    const mustDiscard = Q.discardRequired(state) > 0;
    const endTurnBtn = document.getElementById('end-turn-btn');
    endTurnBtn.disabled = !myTurn || mustDiscard;
    endTurnBtn.textContent = mustDiscard
      ? 'Discard ' + Q.discardRequired(state) + ' to end turn'
      : 'End turn →';
  }

  async function onSynthParticle() {
    if (!isMyTurn()) return showSynthError("It's not your turn.");
    const ids = Array.from(selectedHandCards);
    const r = Q.synthesizeParticle(state, ids);
    if (!r.ok) return showSynthError(r.error);
    hideSynthError();
    selectedHandCards.clear();
    if (online) await syncState(); else render();
  }

  async function onBuildAtom() {
    if (!isMyTurn()) return showSynthError("It's not your turn.");
    const ids = Array.from(selectedParticles);
    const electrons = clampInt(document.getElementById('atom-electron-count').value, 0, 4, 0);
    const r = Q.synthesizeAtom(state, ids, electrons);
    if (!r.ok) return showSynthError(r.error);
    hideSynthError();
    selectedParticles.clear();
    document.getElementById('atom-electron-count').value = '0';
    if (online) await syncState(); else render();
  }

  async function onEndSynthesis() {
    if (!isMyTurn()) return;
    Q.endSynthesis(state);
    clearSelections();
    if (online) await syncState(); else render();
  }

  async function onEndTurn() {
    if (!isMyTurn()) return;
    const r = Q.endTurn(state);
    if (!r.ok) return;
    if (online) {
      // No device handoff online — fold the next player's beginTurn into the
      // same write so the next client wakes up with cards already in hand.
      if (state.phase === 'between') Q.beginTurn(state);
      clearSelections();
      await syncState();
    } else {
      passScreenAcknowledged = (state.phase === 'over'); // skip pass screen when game ends
      clearSelections();
      render();
    }
  }

  function showSynthError(msg) {
    const el = document.getElementById('synth-error');
    el.textContent = msg;
    el.hidden = false;
  }
  function hideSynthError() {
    document.getElementById('synth-error').hidden = true;
  }
  function clearSelections() {
    selectedHandCards.clear();
    selectedParticles.clear();
    hideSynthError();
    const ec = document.getElementById('atom-electron-count');
    if (ec) ec.value = '0';
  }

  // ---------- Game over ----------

  function winnerSummary(p) {
    return variantsOn().heliumPrize
      ? Q.heliumCount(p) + ' helium atom' + (Q.heliumCount(p) === 1 ? '' : 's')
      : Q.formatEnergy(p.energy);
  }

  function rankedPlayers() {
    if (variantsOn().heliumPrize) {
      return [...state.players].sort((a, b) =>
        Q.heliumCount(b) - Q.heliumCount(a) || b.energy - a.energy);
    }
    return [...state.players].sort((a, b) => b.energy - a.energy);
  }

  function renderGameOver() {
    const ws = Q.winners(state);
    const metric = variantsOn().heliumPrize ? 'Helium Prize' : 'energy';
    const winText = ws.length === 1
      ? ws[0].name + ' wins with ' + winnerSummary(ws[0]) + '!'
      : 'Tie between ' + ws.map(w => w.name).join(', ') + ' (' + winnerSummary(ws[0]) + ').';
    document.getElementById('winner-text').textContent =
      winText + (variantsOn().heliumPrize ? '' : '');
    const totalAnn = state.players.reduce((s, p) => s + (p.annihilations || 0), 0);
    const notes = [];
    if (variantsOn().heliumPrize) notes.push('Won by ' + metric + ' (most Helium-3/-4 atoms).');
    notes.push(totalAnn > 0
      ? 'Dirac\'s Dubious Deed: ' + totalAnn + ' e⁻/e⁺ pair' + (totalAnn === 1 ? '' : 's') + ' annihilated for ' + Q.formatEnergy(totalAnn * Q.ANNIHILATION_ENERGY) + '.'
      : 'No annihilations.');
    document.getElementById('annihilation-text').textContent = notes.join(' ');
    const tbody = document.getElementById('final-scoreboard-body');
    tbody.innerHTML = '';
    rankedPlayers().forEach(p => {
      const tr = document.createElement('tr');
      const atomsCell = variantsOn().heliumPrize
        ? p.stockpile.atoms.length + ' (' + Q.heliumCount(p) + ' He)'
        : String(p.stockpile.atoms.length);
      tr.innerHTML =
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + Q.formatEnergy(p.energy) + '</td>' +
        '<td>' + atomsCell + '</td>' +
        '<td>' + p.stockpile.particles.length + '</td>' +
        '<td>' + (p.annihilations || 0) + '</td>';
      tbody.appendChild(tr);
    });
  }

  // ---------- Util ----------

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
})();
