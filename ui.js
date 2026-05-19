(function () {
  const Q = window.QuarkGame;
  let state = null;
  let passScreenAcknowledged = false;

  const setup = document.getElementById('setup');
  const gameEl = document.getElementById('game');
  const passEl = document.getElementById('pass-screen');

  document.getElementById('start').addEventListener('click', startGame);
  document.getElementById('draw-btn').addEventListener('click', onDraw);
  document.getElementById('end-turn-btn').addEventListener('click', onEndTurn);
  document.getElementById('pass-continue').addEventListener('click', () => {
    passScreenAcknowledged = true;
    render();
  });
  document.getElementById('new-game').addEventListener('click', () => location.reload());

  function startGame() {
    const count = parseInt(document.getElementById('player-count').value, 10);
    const names = [];
    for (let i = 0; i < count; i++) {
      const input = document.getElementById('p' + i);
      names.push((input && input.value.trim()) || 'Player ' + (i + 1));
    }
    state = Q.createGame(names);
    passScreenAcknowledged = true; // first player doesn't need a pass screen
    setup.hidden = true;
    gameEl.hidden = false;
    render();
  }

  function onDraw() {
    const res = Q.drawCard(state);
    if (!res.ok) return;
    render();
  }

  function onEndTurn() {
    const res = Q.endTurn(state);
    if (!res.ok) return;
    passScreenAcknowledged = false;
    render();
  }

  function render() {
    if (!state) return;
    if (state.phase === 'over') {
      renderGameOver();
      return;
    }
    if (!passScreenAcknowledged) {
      renderPassScreen();
      return;
    }
    passEl.hidden = true;
    gameEl.hidden = false;
    renderTurn();
  }

  function renderPassScreen() {
    gameEl.hidden = true;
    passEl.hidden = false;
    document.getElementById('pass-text').textContent =
      'Pass device to ' + Q.currentPlayer(state).name;
  }

  function renderTurn() {
    const p = Q.currentPlayer(state);
    document.getElementById('current-name').textContent = p.name;
    document.getElementById('deck-count').textContent = state.deck.length;
    document.getElementById('turn-number').textContent = state.turn;

    document.getElementById('draw-btn').disabled = state.phase !== 'draw';
    document.getElementById('end-turn-btn').disabled = state.phase !== 'between';

    renderCollected(p);
    renderScoreboard();
  }

  function renderCollected(player) {
    const wrap = document.getElementById('collected');
    wrap.innerHTML = '';
    if (!player.collected.length) {
      wrap.innerHTML = '<p class="muted">No cards yet.</p>';
      return;
    }
    for (const card of player.collected) {
      wrap.appendChild(cardEl(card));
    }
  }

  function renderScoreboard() {
    const tbody = document.getElementById('scoreboard-body');
    tbody.innerHTML = '';
    for (const p of state.players) {
      const tr = document.createElement('tr');
      if (p.id === state.currentPlayer) tr.classList.add('active');
      tr.innerHTML =
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + p.collected.length + '</td>' +
        '<td>' + p.score + '</td>';
      tbody.appendChild(tr);
    }
  }

  function renderGameOver() {
    gameEl.hidden = true;
    passEl.hidden = true;
    const over = document.getElementById('game-over');
    over.hidden = false;
    const ws = Q.winners(state);
    const winText = ws.length === 1
      ? ws[0].name + ' wins with ' + ws[0].score + ' points!'
      : 'Tie between ' + ws.map(w => w.name).join(', ') + ' at ' + ws[0].score + ' points.';
    document.getElementById('winner-text').textContent = winText;
    const finalTbody = document.getElementById('final-scoreboard-body');
    finalTbody.innerHTML = '';
    [...state.players].sort((a,b) => b.score - a.score).forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + escapeHtml(p.name) + '</td>' +
                     '<td>' + p.collected.length + '</td>' +
                     '<td>' + p.score + '</td>';
      finalTbody.appendChild(tr);
    });
  }

  function cardEl(card) {
    const el = document.createElement('div');
    el.className = 'card flavor-' + card.flavor;
    el.innerHTML =
      '<div class="card-symbol">' + card.flavor + '</div>' +
      '<div class="card-label">' + escapeHtml(card.label) + '</div>' +
      '<div class="card-value">' + card.value + '</div>';
    return el;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  // Initial player-name inputs.
  const playerCountEl = document.getElementById('player-count');
  function renderNameInputs() {
    const count = parseInt(playerCountEl.value, 10);
    const wrap = document.getElementById('player-names');
    wrap.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'name-row';
      row.innerHTML =
        '<label for="p' + i + '">Player ' + (i + 1) + '</label>' +
        '<input id="p' + i + '" type="text" placeholder="Name" />';
      wrap.appendChild(row);
    }
  }
  playerCountEl.addEventListener('change', renderNameInputs);
  renderNameInputs();
})();
