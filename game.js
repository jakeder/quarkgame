// Barebones game logic. No DOM access — kept separate so it can be reused
// on a server when remote multiplayer is added.

const FLAVORS = [
  { key: 'u', label: 'up',      value: 1 },
  { key: 'd', label: 'down',    value: 1 },
  { key: 'c', label: 'charm',   value: 2 },
  { key: 's', label: 'strange', value: 2 },
  { key: 't', label: 'top',     value: 3 },
  { key: 'b', label: 'bottom',  value: 3 },
];

function buildDeck() {
  const cards = [];
  let id = 0;
  // 4 copies of each flavor = 24 cards.
  for (const f of FLAVORS) {
    for (let i = 0; i < 4; i++) {
      cards.push({ id: id++, flavor: f.key, label: f.label, value: f.value });
    }
  }
  return cards;
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGame(playerNames, opts = {}) {
  const rng = opts.rng ?? Math.random;
  return {
    deck: shuffle(buildDeck(), rng),
    players: playerNames.map((name, i) => ({ id: i, name, collected: [], score: 0 })),
    currentPlayer: 0,
    turn: 1,
    phase: 'draw', // 'draw' | 'between' | 'over'
  };
}

function currentPlayer(state) {
  return state.players[state.currentPlayer];
}

function drawCard(state) {
  if (state.phase !== 'draw') return { ok: false, error: 'Not draw phase' };
  if (state.deck.length === 0) return { ok: false, error: 'Deck empty' };
  const card = state.deck.pop();
  const p = currentPlayer(state);
  p.collected.push(card);
  p.score += card.value;
  state.phase = 'between';
  return { ok: true, card };
}

function endTurn(state) {
  if (state.phase === 'over') return { ok: false, error: 'Game over' };
  const next = (state.currentPlayer + 1) % state.players.length;
  if (next === 0) state.turn += 1;
  state.currentPlayer = next;
  if (state.deck.length === 0) {
    state.phase = 'over';
  } else {
    state.phase = 'draw';
  }
  return { ok: true };
}

function winners(state) {
  if (!state.players.length) return [];
  const max = Math.max(...state.players.map(p => p.score));
  return state.players.filter(p => p.score === max);
}

window.QuarkGame = { FLAVORS, createGame, drawCard, endTurn, currentPlayer, winners };
