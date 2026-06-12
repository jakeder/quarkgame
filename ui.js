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

  // Game screen wiring
  document.getElementById('synth-particle-btn').addEventListener('click', onSynthParticle);
  document.getElementById('build-atom-btn').addEventListener('click', onBuildAtom);
  document.getElementById('end-synth-btn').addEventListener('click', onEndSynthesis);
  document.getElementById('end-turn-btn').addEventListener('click', onEndTurn);
  document.getElementById('atom-electron-count').addEventListener('input', updateActionButtons);

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
    const mp = await window.MultiplayerReady;
    if (!mp.ready) return showOnlineError(mp.error);
    try {
      const { code, uid } = await mp.createRoom(name);
      enterLobby(code, uid, true, { drawSize, maxRounds });
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
    const list = document.getElementById('lobby-players');
    list.innerHTML = '';
    Object.entries(players)
      .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
      .forEach(([pid, p]) => {
        const li = document.createElement('li');
        const isHost = pid === room.hostUid;
        const isYou  = pid === online.uid;
        li.innerHTML =
          '<span>' + escapeHtml(p.name) + '</span>' +
          (isHost ? '<span class="badge">host</span>' : '') +
          (isYou ? '<span class="badge you">you</span>' : '');
        list.appendChild(li);
      });
    document.getElementById('lobby-start').disabled = Object.keys(players).length < 2;
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
    const initial = Q.createGame(names, online.hostConfig || {});
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
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'setup-row';
      row.innerHTML =
        '<label for="p' + i + '">Player ' + (i + 1) + '</label>' +
        '<input id="p' + i + '" type="text" placeholder="Name" />';
      wrap.appendChild(row);
    }
  }

  function startGame() {
    const count     = parseInt(document.getElementById('player-count').value, 10);
    const drawSize  = clampInt(document.getElementById('draw-size').value, 1, 10, 3);
    const maxRounds = clampInt(document.getElementById('max-rounds').value, 3, 20, 10);
    const names = [];
    for (let i = 0; i < count; i++) {
      const input = document.getElementById('p' + i);
      names.push((input && input.value.trim()) || 'Player ' + (i + 1));
    }
    state = Q.createGame(names, { drawSize, maxRounds });
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

    const particles = Q.PARTICLE_RULES.map(rule => {
      const recipe = formatFlavorRecipe(rule.flavors);
      const spin   = rule.spin === 'aligned' ? 'all same spin' : 'mixed spins';
      return (
        '<li class="ref-item' + (rule.stable ? '' : ' unstable') + '">' +
          '<div class="ref-head">' + escapeHtml(Q.PARTICLE_LABEL[rule.type]) + '</div>' +
          '<div class="ref-line">' + recipe + ' · ' + spin + '</div>' +
          '<div class="ref-line ref-energy">' + Q.formatEnergy(rule.energy) + ' · ' + describeDecay(rule) + '</div>' +
        '</li>'
      );
    }).join('');

    const atoms = Q.ATOM_RULES.map(rule => {
      const parts = [];
      if (rule.protons)  parts.push(rule.protons + 'p');
      if (rule.neutrons) parts.push(rule.neutrons + 'n');
      const recipe = parts.join(' + ') + ' · ' + rule.electrons + ' e⁻';
      const spinLbl = describeSpinSum(rule);
      const stable = rule.stable ? 'stable' : 'unstable → ³He + e⁻';
      return (
        '<li class="ref-item' + (rule.stable ? '' : ' unstable') + '">' +
          '<div class="ref-head">' + escapeHtml(Q.ATOM_LABEL[rule.type]) + '</div>' +
          '<div class="ref-line">' + recipe + (spinLbl ? ' · ' + spinLbl : '') + '</div>' +
          '<div class="ref-line ref-energy">' + Q.formatEnergy(rule.energy) + ' · ' + stable + '</div>' +
        '</li>'
      );
    }).join('');

    wrap.innerHTML =
      '<h2>Reference</h2>' +
      '<div class="ref-block">' +
        '<h3>Particles</h3>' +
        '<ul class="ref-list">' + particles + '</ul>' +
      '</div>' +
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
          '<li>End of game: each e⁻ + e⁺ pair annihilates for ' + Q.formatEnergy(Q.ANNIHILATION_ENERGY) + '.</li>' +
        '</ul>' +
      '</div>';
  }

  function formatFlavorRecipe(flavors) {
    const parts = [];
    if (flavors.u) parts.push(flavors.u + 'u');
    if (flavors.d) parts.push(flavors.d + 'd');
    return parts.join(' + ');
  }

  function describeDecay(rule) {
    if (rule.stable) return 'stable';
    if (!rule.decay) return 'unstable';
    const out = ['→ p⁺'];
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
          escapeHtml(currentP.name) + '…';
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
      : buckets.map(b =>
          '<div class="ledger-row">' +
            '<span class="ledger-label">' + escapeHtml(b.label) + '</span>' +
            '<span class="ledger-count">×' + b.count + '</span>' +
            '<span class="ledger-amount">+' + Q.formatEnergy(b.total) + '</span>' +
          '</div>'
        ).join('');
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
    [...state.players].sort((a, b) => b.energy - a.energy).forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + Q.formatEnergy(p.energy) + '</td>' +
        '<td>' + p.stockpile.atoms.length + '</td>' +
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
    document.getElementById('current-name').textContent = currentP.name;
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
    updateActionButtons();

    const synthing = state.phase === 'synthesize';
    document.getElementById('synth-group-synthesize').hidden = !synthing;
    document.getElementById('end-turn-btn').hidden = synthing;
    document.getElementById('decays-section').hidden = synthing;
  }

  function renderHand(player) {
    const wrap = document.getElementById('hand');
    wrap.innerHTML = '';
    document.getElementById('hand-info').textContent =
      player.hand.length === 0
        ? '(empty)'
        : '(' + player.hand.length + ' cards, click to select for particle synthesis)';
    if (player.hand.length === 0) return;
    for (const card of player.hand) {
      const el = renderCard(card, selectedHandCards.has(card.id));
      el.addEventListener('click', () => {
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
                   (selected ? ' selected' : '') + (card.synthetic ? ' synthetic' : '');
    el.innerHTML =
      '<div class="card-charge">' + Q.FLAVOR_CHARGE[card.flavor] + '</div>' +
      '<div class="card-symbol">' + card.flavor + '</div>' +
      '<div class="card-spin">' + Q.SPIN_GLYPH[card.spin] + '</div>';
    el.title = Q.describeCard(card);
    return el;
  }

  function renderStockpile(player) {
    document.getElementById('electron-count').textContent = player.stockpile.electrons;
    document.getElementById('positron-count').textContent = player.stockpile.positrons;
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
    const rule = Q.PARTICLE_RULES.find(r => r.type === particle.type);
    el.className = 'tile particle ' + particle.type.replace(/[+\-]/g, '-')
      + (selected ? ' selected' : '') + (particle.synthetic ? ' synthetic' : '')
      + (rule && !rule.stable ? ' unstable' : '');
    const cards = particle.cards.map(c =>
      '<span class="mini-card flavor-' + c.flavor + ' color-' + c.color + '">' +
      c.flavor + Q.SPIN_GLYPH[c.spin] + '</span>'
    ).join('');
    el.innerHTML =
      '<div class="tile-head"><strong>' + Q.PARTICLE_LABEL[particle.type] + '</strong>' +
      (particle.catMarker ? ' <span class="cat" title="Schrödinger\'s Cat: decays at end of your next turn">🐈‍⬛</span>' : '') +
      '</div>' +
      '<div class="tile-cards">' + cards + '</div>' +
      '<div class="tile-energy">' + Q.formatEnergy(rule.energy) +
        ' · spin ' + signed(particleSpinSum(particle)) + '</div>';
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
    el.className = 'tile atom atom-' + atom.type +
      (rule && !rule.stable ? ' unstable' : '');
    const parts = atom.particles.map(p =>
      '<span class="mini-particle">' + (p.type === 'proton' ? 'p⁺' : 'n⁰') + '</span>'
    ).join('');
    const electrons = '<span class="mini-electron">e⁻ × ' + atom.electrons + '</span>';
    el.innerHTML =
      '<div class="tile-head"><strong>' + Q.ATOM_LABEL[atom.type] + '</strong></div>' +
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
    synthBtn.disabled = !synthing || !myTurn || selectedHandCards.size !== 3;
    synthBtn.textContent = selectedHandCards.size === 3
      ? 'Synthesize particle from 3 selected cards'
      : 'Synthesize particle (need 3 cards, ' + selectedHandCards.size + ' selected)';
    atomBtn.disabled = !synthing || !myTurn || selectedParticles.size === 0;
    atomBtn.textContent = selectedParticles.size === 0
      ? 'Build atom from selected particles'
      : 'Build atom from ' + selectedParticles.size + ' particle' + (selectedParticles.size === 1 ? '' : 's');
    document.getElementById('end-synth-btn').disabled = !synthing || !myTurn;
    document.getElementById('end-turn-btn').disabled = !myTurn;
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

  function renderGameOver() {
    const ws = Q.winners(state);
    const winText = ws.length === 1
      ? ws[0].name + ' wins with ' + Q.formatEnergy(ws[0].energy) + '!'
      : 'Tie between ' + ws.map(w => w.name).join(', ') + ' at ' + Q.formatEnergy(ws[0].energy) + '.';
    document.getElementById('winner-text').textContent = winText;
    const totalAnn = state.players.reduce((s, p) => s + (p.annihilations || 0), 0);
    document.getElementById('annihilation-text').textContent =
      totalAnn > 0
        ? 'Dirac\'s Dubious Deed: ' + totalAnn + ' e⁻/e⁺ pair' + (totalAnn === 1 ? '' : 's') + ' annihilated for ' + Q.formatEnergy(totalAnn * Q.ANNIHILATION_ENERGY) + '.'
        : 'No annihilations.';
    const tbody = document.getElementById('final-scoreboard-body');
    tbody.innerHTML = '';
    [...state.players].sort((a, b) => b.energy - a.energy).forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + Q.formatEnergy(p.energy) + '</td>' +
        '<td>' + p.stockpile.atoms.length + '</td>' +
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
