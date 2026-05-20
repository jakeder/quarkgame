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
    const drawSize  = clampInt(document.getElementById('draw-size').value, 1, 6, 3);
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
    render();
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
    const passNeeded = !passScreenAcknowledged && state.phase === 'between';
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
  }

  function onPassContinue() {
    Q.beginTurn(state);
    passScreenAcknowledged = true;
    clearSelections();
    render();
  }

  // ---------- Turn screen ----------

  function renderTurn() {
    const p = Q.currentPlayer(state);
    document.getElementById('current-name').textContent = p.name;
    document.getElementById('round-number').textContent = state.round;
    document.getElementById('max-rounds-display').textContent = state.config.maxRounds;
    document.getElementById('deck-count').textContent = state.deck.length;
    document.getElementById('energy-display').textContent = Q.formatEnergy(p.energy);

    const chip = document.getElementById('phase-chip');
    chip.textContent = state.phase === 'synthesize' ? 'Synthesize' : 'Decays';
    chip.className = 'phase-chip phase-' + state.phase;

    renderHand(p);
    renderStockpile(p);
    renderScoreboard();
    renderDecays();
    updateActionButtons();

    const synthing = state.phase === 'synthesize';
    document.getElementById('synth-actions').style.display = synthing ? '' : 'none';
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
      + (selected ? ' selected' : '') + (particle.synthetic ? ' synthetic' : '');
    const cards = particle.cards.map(c =>
      '<span class="mini-card flavor-' + c.flavor + ' color-' + c.color + '">' +
      c.flavor + Q.SPIN_GLYPH[c.spin] + '</span>'
    ).join('');
    el.innerHTML =
      '<div class="tile-head"><strong>' + Q.PARTICLE_LABEL[particle.type] + '</strong>' +
      (particle.catMarker ? ' <span class="cat" title="Schrödinger\'s Cat: decays at end of your next turn">🐈‍⬛</span>' : '') +
      '</div>' +
      '<div class="tile-cards">' + cards + '</div>' +
      '<div class="tile-energy">' + Q.formatEnergy(rule.energy) + '</div>';
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
    el.className = 'tile atom atom-' + atom.type;
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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = Q.decayTritium(state, atom.id);
        if (!r.ok) return showSynthError(r.error);
        render();
      });
      el.appendChild(btn);
    }
    return el;
  }

  function renderScoreboard() {
    const tbody = document.getElementById('scoreboard-body');
    tbody.innerHTML = '';
    for (const p of state.players) {
      const tr = document.createElement('tr');
      if (p.id === state.currentPlayer) tr.classList.add('active');
      tr.innerHTML =
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + Q.formatEnergy(p.energy) + '</td>' +
        '<td>' + p.stockpile.atoms.length + '</td>' +
        '<td>' + p.stockpile.particles.length + '</td>';
      tbody.appendChild(tr);
    }
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
    synthBtn.disabled = !synthing || selectedHandCards.size !== 3;
    synthBtn.textContent = selectedHandCards.size === 3
      ? 'Synthesize particle from 3 selected cards'
      : 'Synthesize particle (need 3 cards, ' + selectedHandCards.size + ' selected)';
    atomBtn.disabled = !synthing || selectedParticles.size === 0;
    atomBtn.textContent = selectedParticles.size === 0
      ? 'Build atom from selected particles'
      : 'Build atom from ' + selectedParticles.size + ' particle' + (selectedParticles.size === 1 ? '' : 's');
    document.getElementById('end-synth-btn').disabled = !synthing;
  }

  function onSynthParticle() {
    const ids = Array.from(selectedHandCards);
    const r = Q.synthesizeParticle(state, ids);
    if (!r.ok) return showSynthError(r.error);
    hideSynthError();
    selectedHandCards.clear();
    render();
  }

  function onBuildAtom() {
    const ids = Array.from(selectedParticles);
    const electrons = clampInt(document.getElementById('atom-electron-count').value, 0, 4, 0);
    const r = Q.synthesizeAtom(state, ids, electrons);
    if (!r.ok) return showSynthError(r.error);
    hideSynthError();
    selectedParticles.clear();
    document.getElementById('atom-electron-count').value = '0';
    render();
  }

  function onEndSynthesis() {
    Q.endSynthesis(state);
    clearSelections();
    render();
  }

  function onEndTurn() {
    const r = Q.endTurn(state);
    if (!r.ok) return;
    passScreenAcknowledged = (state.phase === 'over'); // skip pass screen when game ends
    clearSelections();
    render();
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
