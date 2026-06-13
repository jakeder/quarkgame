// Qwazy Quarks — Basic Game rules engine.
// Pure logic, no DOM access. Reusable on a server when remote multiplayer arrives.

const FLAVOR_CHARGE = { u: '+2/3', d: '−1/3' };
const FLAVOR_LABEL  = { u: 'up',   d: 'down' };
const COLOR_LABEL   = { R: 'red',  G: 'green', B: 'blue' };
const SPIN_GLYPH    = { up: '↑', down: '↓' };

const eV  = 1;
const MeV = 1_000_000;
const GeV = 1_000_000_000;

// Particle recipes. spin: 'mixed' = NOT all same spin (i.e., at least one up AND
// at least one down). 'aligned' = all three up or all three down. All recipes
// require one card of each color (RGB) — Gell-Mann's Gimmick.
const PARTICLE_RULES = [
  { type: 'proton',  flavors: { u: 2, d: 1 }, spin: 'mixed',   energy: 938 * MeV,  stable: true,  decay: null },
  { type: 'neutron', flavors: { u: 1, d: 2 }, spin: 'mixed',   energy: 940 * MeV,  stable: false, decay: { electrons: 1, positrons: 0, delayed: true  } },
  { type: 'delta++', flavors: { u: 3, d: 0 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 0, positrons: 1, delayed: false } },
  { type: 'delta+',  flavors: { u: 2, d: 1 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 0, positrons: 0, delayed: false } },
  { type: 'delta0',  flavors: { u: 1, d: 2 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 1, positrons: 0, delayed: false } },
  { type: 'delta-',  flavors: { u: 0, d: 3 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 2, positrons: 0, delayed: false } },
];

const PARTICLE_LABEL = {
  'proton':  'Proton (p⁺)',
  'neutron': 'Neutron (n⁰)',
  'delta++': 'Delta⁺⁺ (Δ⁺⁺)',
  'delta+':  'Delta⁺ (Δ⁺)',
  'delta0':  'Delta⁰ (Δ⁰)',
  'delta-':  'Delta⁻ (Δ⁻)',
};

// Atom recipes. spinSumCheck takes the literal sum of quark spins (+1 per up,
// -1 per down). The He-4 sum is always even (12 spins of ±1), so the
// rulebook's "0 or ±1" reduces in practice to 0 — kept literal in code.
const ATOM_RULES = [
  { type: 'H',   protons: 1, neutrons: 0, electrons: 1, energy: 13.6 * eV,    spinSumCheck: () => true,                                 stable: true  },
  { type: 'D',   protons: 1, neutrons: 1, electrons: 1, energy: 2.22 * MeV,   spinSumCheck: (s) => s === 0,                             stable: true  },
  { type: 'T',   protons: 1, neutrons: 2, electrons: 1, energy: 8.48 * MeV,   spinSumCheck: (s) => s === 1 || s === -1,                 stable: false },
  { type: 'He3', protons: 2, neutrons: 1, electrons: 2, energy: 7.72 * MeV,   spinSumCheck: (s) => s === 1 || s === -1,                 stable: true  },
  { type: 'He4', protons: 2, neutrons: 2, electrons: 2, energy: 28.3 * MeV,   spinSumCheck: (s) => s === -1 || s === 0 || s === 1,      stable: true  },
];

const ATOM_LABEL = {
  'H':   'Hydrogen (H)',
  'D':   'Deuterium (²H)',
  'T':   'Tritium (³H)',
  'He3': 'Helium-3 (³He)',
  'He4': 'Helium-4 (⁴He)',
};

const ANNIHILATION_ENERGY = 1.02 * MeV;

// ── Optional variants (Charge Neutrality Agreement) ─────────────────────────
const VARIANT_LABEL = {
  pauli:       'Pauli Penalty',
  heliumPrize: 'Helium Prize',
};
const VARIANT_DESC = {
  pauli:       'Pay an energy penalty each turn for free charges left in your stockpile. Annihilate positrons any time; H⁻ anions are exempt.',
  heliumPrize: 'Win by synthesizing the most Helium-3 and Helium-4 atoms (ties broken by energy) instead of the most energy.',
};

// Pauli Penalty paid at the end of each turn for N free charges (free protons +
// positrons + free electrons) in the Material Stockpile. The penalty grows with
// the N(N−1)/2 pairwise interactions per the rulebook table.
const PAULI_PENALTY = [
  0,            // N = 0
  0,            // N = 1
  13.6 * eV,    // N = 2
  1.022 * MeV,  // N = 3
  2.22 * MeV,   // N = 4
  7.72 * MeV,   // N = 5
  8.48 * MeV,   // N = 6
  28.3 * MeV,   // N = 7
  938.3 * MeV,  // N = 8
  939.5 * MeV,  // N = 9
];
const PAULI_PENALTY_MAX = 1.232 * GeV; // N >= 10

function pauliPenalty(n) {
  if (n <= 1) return 0;
  if (n < PAULI_PENALTY.length) return PAULI_PENALTY[n];
  return PAULI_PENALTY_MAX;
}

// Free charges = free protons + free positrons + free electrons. Electrons bound
// inside atoms (including the extra electron of an H⁻ anion) are not free and
// don't count.
function freeChargeCount(player) {
  const freeProtons = player.stockpile.particles.filter(p => p.type === 'proton').length;
  return freeProtons + player.stockpile.positrons + player.stockpile.electrons;
}

function heliumCount(player) {
  return player.stockpile.atoms.filter(a => a.type === 'He3' || a.type === 'He4').length;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck() {
  // 12 distinct cards (2 flavors x 3 colors x 2 spins) x 4 copies = 48.
  const cards = [];
  let id = 0;
  for (const flavor of ['u', 'd']) {
    for (const color of ['R', 'G', 'B']) {
      for (const spin of ['up', 'down']) {
        for (let copy = 0; copy < 4; copy++) {
          cards.push({ id: 'c' + (id++), flavor, color, spin });
        }
      }
    }
  }
  return cards;
}

function nextId(state, prefix) {
  return prefix + (state._nextId++);
}

function makeSyntheticCards(state, spec) {
  // spec: [{flavor, color, spin}, ...]
  return spec.map(s => ({ id: nextId(state, 'sc'), synthetic: true, ...s }));
}

function makeSyntheticProton(state) {
  // Default arrangement: u(R,up), u(G,up), d(B,down) — satisfies "two different spins".
  // Spin sum = +1 (two up, one down).
  return {
    id: nextId(state, 'p'),
    type: 'proton',
    cards: makeSyntheticCards(state, [
      { flavor: 'u', color: 'R', spin: 'up'   },
      { flavor: 'u', color: 'G', spin: 'up'   },
      { flavor: 'd', color: 'B', spin: 'down' },
    ]),
    catMarker: false,
    catPlacedTurn: null,
    createdTurn: state.turn,
    synthetic: true,
  };
}

function colorsAreRGB(cards) {
  const cs = new Set(cards.map(c => c.color));
  return cs.size === 3 && cs.has('R') && cs.has('G') && cs.has('B');
}

function flavorCounts(cards) {
  return {
    u: cards.filter(c => c.flavor === 'u').length,
    d: cards.filter(c => c.flavor === 'd').length,
  };
}

function spinAllSame(cards) {
  return cards.every(c => c.spin === 'up') || cards.every(c => c.spin === 'down');
}

function identifyParticle(cards) {
  if (cards.length !== 3) {
    return { ok: false, reason: 'Select exactly three quark cards to synthesize a particle.' };
  }
  if (!colorsAreRGB(cards)) {
    return { ok: false, reason: 'Need one card of each color (R, G, B) — Gell-Mann’s Gimmick.' };
  }
  const f = flavorCounts(cards);
  const aligned = spinAllSame(cards);
  for (const rule of PARTICLE_RULES) {
    if (rule.flavors.u !== f.u || rule.flavors.d !== f.d) continue;
    if (rule.spin === 'aligned' && !aligned) continue;
    if (rule.spin === 'mixed' && aligned) continue;
    return { ok: true, rule };
  }
  // If we got here the flavor/color check passed but no spin rule matches.
  // That can happen for e.g. (u,u,d) with one up + two down — that's a Proton (mixed),
  // which should match. The only way to fall through is a logic bug, but keep a defensive message.
  return { ok: false, reason: 'These cards do not match any particle recipe.' };
}

function spinSumOfParticles(particles) {
  let sum = 0;
  for (const p of particles) {
    for (const c of p.cards) sum += (c.spin === 'up' ? 1 : -1);
  }
  return sum;
}

function identifyAtom(particles, electronCount) {
  const protons  = particles.filter(p => p.type === 'proton').length;
  const neutrons = particles.filter(p => p.type === 'neutron').length;
  if (protons + neutrons !== particles.length) {
    return { ok: false, reason: 'Atoms are made from protons and neutrons only.' };
  }
  for (const rule of ATOM_RULES) {
    if (rule.protons !== protons || rule.neutrons !== neutrons) continue;
    if (rule.electrons !== electronCount) {
      return { ok: false, reason: `${ATOM_LABEL[rule.type]} needs exactly ${rule.electrons} free electron${rule.electrons === 1 ? '' : 's'}.` };
    }
    const sum = spinSumOfParticles(particles);
    if (!rule.spinSumCheck(sum)) {
      return { ok: false, reason: `Quark spin sum ${sum >= 0 ? '+' + sum : sum} does not satisfy the ${ATOM_LABEL[rule.type]} constraint.` };
    }
    return { ok: true, rule, spinSum: sum };
  }
  return { ok: false, reason: 'No atom matches that combination of protons and neutrons.' };
}

function formatEnergy(value) {
  if (value === 0) return '0 eV';
  const abs = Math.abs(value);
  if (abs >= GeV) return (value / GeV).toFixed(2).replace(/\.?0+$/, '') + ' GeV';
  if (abs >= MeV) return (value / MeV).toFixed(2).replace(/\.?0+$/, '') + ' MeV';
  if (abs >= 1)   return value.toFixed(1).replace(/\.0$/, '') + ' eV';
  return value + ' eV';
}

function describeCard(card) {
  return `${FLAVOR_LABEL[card.flavor]} ${COLOR_LABEL[card.color]} ${card.spin}`;
}

function createGame(playerNames, opts) {
  const o = opts || {};
  const drawSize  = o.drawSize  != null ? o.drawSize  : 3;
  const maxRounds = o.maxRounds != null ? o.maxRounds : 10;
  const rng       = o.rng || Math.random;
  const variants = {
    pauli:       !!(o.variants && o.variants.pauli),
    heliumPrize: !!(o.variants && o.variants.heliumPrize),
  };
  const state = {
    _nextId: 1,
    deck: shuffle(buildDeck(), rng),
    players: playerNames.map((name, i) => ({
      id: i,
      name,
      hand: [],
      stockpile: { particles: [], atoms: [], electrons: 0, positrons: 0 },
      energy: 0,
      log: [],
      annihilations: 0,
    })),
    currentPlayer: 0,
    turn: 1,           // global turn counter (increments every player change)
    round: 1,          // increments when player index wraps to 0
    phase: 'synthesize',  // 'synthesize' | 'decays' | 'between' | 'over'
    config: { drawSize, maxRounds, variants },
    lastDecayEvents: [],
    lastSynthEvents: [],
    lastPenalty: null,
  };
  // Initial draw for the first player.
  drawForCurrentPlayer(state);
  return state;
}

function currentPlayer(state) {
  return state.players[state.currentPlayer];
}

function drawForCurrentPlayer(state) {
  const p = currentPlayer(state);
  const n = Math.min(state.config.drawSize, state.deck.length);
  for (let i = 0; i < n; i++) {
    p.hand.push(state.deck.pop());
  }
  return n;
}

function synthesizeParticle(state, cardIds) {
  if (state.phase !== 'synthesize') return { ok: false, error: 'Not in synthesize phase.' };
  const p = currentPlayer(state);
  const cards = cardIds.map(id => p.hand.find(c => c.id === id)).filter(Boolean);
  if (cards.length !== cardIds.length) return { ok: false, error: 'One or more selected cards are not in hand.' };
  const r = identifyParticle(cards);
  if (!r.ok) return { ok: false, error: r.reason };
  p.hand = p.hand.filter(c => !cardIds.includes(c.id));
  const particle = {
    id: nextId(state, 'p'),
    type: r.rule.type,
    cards,
    catMarker: false,
    catPlacedTurn: null,
    createdTurn: state.turn,
    synthetic: false,
  };
  p.stockpile.particles.push(particle);
  p.energy += r.rule.energy;
  const event = { kind: 'synth-particle', particleType: r.rule.type, energy: r.rule.energy, particleId: particle.id };
  p.log.push(event);
  state.lastSynthEvents.push(event);
  return { ok: true, particle, energy: r.rule.energy };
}

function synthesizeAtom(state, particleIds, electronCount) {
  if (state.phase !== 'synthesize') return { ok: false, error: 'Not in synthesize phase.' };
  const p = currentPlayer(state);
  const particles = particleIds.map(id => p.stockpile.particles.find(x => x.id === id)).filter(Boolean);
  if (particles.length !== particleIds.length) return { ok: false, error: 'One or more selected particles are not free in your stockpile.' };
  if (electronCount < 0) return { ok: false, error: 'Electron count cannot be negative.' };
  if (p.stockpile.electrons < electronCount) return { ok: false, error: `You only have ${p.stockpile.electrons} free electron${p.stockpile.electrons === 1 ? '' : 's'}.` };
  const r = identifyAtom(particles, electronCount);
  if (!r.ok) return { ok: false, error: r.reason };
  // Consume particles + electrons; create atom.
  p.stockpile.particles = p.stockpile.particles.filter(x => !particleIds.includes(x.id));
  p.stockpile.electrons -= electronCount;
  const atom = {
    id: nextId(state, 'a'),
    type: r.rule.type,
    particles,
    electrons: electronCount,
    energy: r.rule.energy,
    createdTurn: state.turn,
    spinSum: r.spinSum,
  };
  p.stockpile.atoms.push(atom);
  p.energy += r.rule.energy;
  const event = { kind: 'synth-atom', atomType: r.rule.type, energy: r.rule.energy, atomId: atom.id };
  p.log.push(event);
  state.lastSynthEvents.push(event);
  return { ok: true, atom, energy: r.rule.energy };
}

function decayTritium(state, atomId) {
  if (state.phase !== 'synthesize') return { ok: false, error: 'Tritium can only be decayed during the synthesize phase.' };
  const p = currentPlayer(state);
  const atom = p.stockpile.atoms.find(a => a.id === atomId);
  if (!atom) return { ok: false, error: 'Atom not found in your stockpile.' };
  if (atom.type !== 'T') return { ok: false, error: 'Only Tritium can be voluntarily decayed.' };
  // One bound neutron decays into a proton; atom becomes Helium-3; player gains 1 free electron.
  // Binding energy already collected when T was synthesized — not refunded or re-collected.
  const ni = atom.particles.findIndex(x => x.type === 'neutron');
  if (ni === -1) return { ok: false, error: 'No neutron available in this atom (corrupted state).' };
  const newProton = makeSyntheticProton(state);
  atom.particles.splice(ni, 1, newProton);
  atom.type = 'He3';
  atom.electrons = 2;     // capture the released electron internally as a bound electron
  atom.energy = ATOM_RULES.find(a => a.type === 'He3').energy;
  atom.spinSum = spinSumOfParticles(atom.particles);
  p.stockpile.electrons += 1;
  const event = { kind: 'tritium-decay', atomId };
  p.log.push(event);
  state.lastSynthEvents.push(event);
  return { ok: true };
}

// Pauli Penalty amendment 1: annihilate one e⁻/e⁺ pair at any time during your
// turn (collecting the annihilation energy), instead of waiting for end of game.
function annihilatePair(state) {
  if (state.phase !== 'synthesize') return { ok: false, error: 'Annihilate during the synthesize phase.' };
  if (!state.config.variants.pauli) return { ok: false, error: 'Annihilate-on-demand is a Pauli Penalty rule.' };
  const p = currentPlayer(state);
  if (p.stockpile.electrons < 1 || p.stockpile.positrons < 1) {
    return { ok: false, error: 'Need at least one free electron and one free positron.' };
  }
  p.stockpile.electrons -= 1;
  p.stockpile.positrons -= 1;
  p.energy += ANNIHILATION_ENERGY;
  p.annihilations = (p.annihilations || 0) + 1;
  const event = { kind: 'annihilation', pairs: 1, energy: ANNIHILATION_ENERGY };
  p.log.push(event);
  return { ok: true, energy: ANNIHILATION_ENERGY };
}

// Pauli Penalty amendment 2: add/remove a free electron to a Hydrogen atom to
// make an H⁻ anion (free of charge). The bound electron leaves the free pool and
// is exempt from the penalty count.
function toggleAnion(state, atomId) {
  if (state.phase !== 'synthesize') return { ok: false, error: 'Adjust anions during the synthesize phase.' };
  if (!state.config.variants.pauli) return { ok: false, error: 'H⁻ anions are a Pauli Penalty rule.' };
  const p = currentPlayer(state);
  const atom = p.stockpile.atoms.find(a => a.id === atomId);
  if (!atom) return { ok: false, error: 'Atom not found in your stockpile.' };
  if (atom.type !== 'H') return { ok: false, error: 'Only Hydrogen can become an H⁻ anion.' };
  if (atom.anion) {
    atom.anion = false;
    p.stockpile.electrons += 1;
    return { ok: true, anion: false };
  }
  if (p.stockpile.electrons < 1) return { ok: false, error: 'No free electron available to add.' };
  p.stockpile.electrons -= 1;
  atom.anion = true;
  return { ok: true, anion: true };
}

function endSynthesis(state) {
  if (state.phase !== 'synthesize') return { ok: false, error: 'Not in synthesize phase.' };
  processDecays(state);
  state.phase = 'decays';
  return { ok: true, events: state.lastDecayEvents };
}

function processDecays(state) {
  const p = currentPlayer(state);
  const events = [];
  const numPlayers = state.players.length;

  // 1. Forced decay of all Delta particles in this player's stockpile.
  const deltas = p.stockpile.particles.filter(x => x.type.startsWith('delta'));
  for (const d of deltas) {
    const rule = PARTICLE_RULES.find(r => r.type === d.type);
    p.stockpile.particles = p.stockpile.particles.filter(x => x.id !== d.id);
    const proton = makeSyntheticProton(state);
    p.stockpile.particles.push(proton);
    p.stockpile.electrons += rule.decay.electrons;
    p.stockpile.positrons += rule.decay.positrons;
    events.push({
      kind: 'decay',
      from: d.type, to: 'proton',
      gainedElectrons: rule.decay.electrons,
      gainedPositrons: rule.decay.positrons,
    });
  }

  // 2. Cat-marked neutrons whose cat was placed in a prior turn-of-this-player decay.
  //    catPlacedTurn was set on this player's previous turn; a full round
  //    (numPlayers turns) elapses before the marker triggers.
  const toDecay = p.stockpile.particles.filter(
    n => n.type === 'neutron' && n.catMarker && (state.turn - n.catPlacedTurn) >= numPlayers
  );
  for (const n of toDecay) {
    p.stockpile.particles = p.stockpile.particles.filter(x => x.id !== n.id);
    const proton = makeSyntheticProton(state);
    p.stockpile.particles.push(proton);
    p.stockpile.electrons += 1;
    events.push({ kind: 'decay', from: 'neutron', to: 'proton', gainedElectrons: 1, gainedPositrons: 0 });
  }

  // 3. Place cat marker on any free neutron without one (they survived this turn unbound).
  for (const n of p.stockpile.particles) {
    if (n.type === 'neutron' && !n.catMarker) {
      n.catMarker = true;
      n.catPlacedTurn = state.turn;
      events.push({ kind: 'cat-marker', particleId: n.id });
    }
  }

  state.lastDecayEvents = events;
  p.log.push({ kind: 'decay-summary', count: events.length });
  return events;
}

function endTurn(state) {
  if (state.phase !== 'decays') return { ok: false, error: 'Process decays first.' };
  // Charge the Pauli Penalty to the player whose turn is ending (before we
  // advance), if the variant is in play.
  state.lastPenalty = null;
  if (state.config.variants.pauli) {
    const ender = currentPlayer(state);
    const n = freeChargeCount(ender);
    const amount = pauliPenalty(n);
    if (amount > 0) {
      ender.energy -= amount;
      ender.log.push({ kind: 'pauli-penalty', energy: -amount, n });
    }
    state.lastPenalty = { playerId: ender.id, name: ender.name, n, amount };
  }
  const numPlayers = state.players.length;
  const wasLastPlayer = (state.currentPlayer + 1) % numPlayers === 0;
  state.currentPlayer = (state.currentPlayer + 1) % numPlayers;
  state.turn += 1;
  if (wasLastPlayer) state.round += 1;

  // End conditions.
  const allHandsEmpty = state.players.every(p => p.hand.length === 0);
  if (state.round > state.config.maxRounds || (state.deck.length === 0 && allHandsEmpty)) {
    endGame(state);
    return { ok: true, gameOver: true };
  }

  state.phase = 'between';
  state.lastSynthEvents = [];
  return { ok: true };
}

function beginTurn(state) {
  if (state.phase !== 'between') return { ok: false, error: 'Not between turns.' };
  drawForCurrentPlayer(state);
  state.phase = 'synthesize';
  state.lastDecayEvents = [];
  state.lastSynthEvents = [];
  return { ok: true };
}

function endGame(state) {
  // Positron annihilation per Dirac's Dubious Deed.
  for (const p of state.players) {
    const pairs = Math.min(p.stockpile.electrons, p.stockpile.positrons);
    if (pairs > 0) {
      p.stockpile.electrons -= pairs;
      p.stockpile.positrons -= pairs;
      const gained = pairs * ANNIHILATION_ENERGY;
      p.energy += gained;
      p.annihilations = pairs;
      p.log.push({ kind: 'annihilation', pairs, energy: gained });
    }
  }
  state.phase = 'over';
}

function winners(state) {
  if (!state.players.length) return [];
  // Helium Prize: most He-3/He-4 atoms wins; ties broken by energy.
  if (state.config.variants && state.config.variants.heliumPrize) {
    const maxH = Math.max(...state.players.map(heliumCount));
    let top = state.players.filter(p => heliumCount(p) === maxH);
    if (top.length > 1) {
      const maxE = Math.max(...top.map(p => p.energy));
      top = top.filter(p => p.energy === maxE);
    }
    return top;
  }
  const max = Math.max(...state.players.map(p => p.energy));
  return state.players.filter(p => p.energy === max);
}

window.QuarkGame = {
  // constants/data
  FLAVOR_CHARGE, FLAVOR_LABEL, COLOR_LABEL, SPIN_GLYPH,
  PARTICLE_RULES, PARTICLE_LABEL,
  ATOM_RULES, ATOM_LABEL,
  ANNIHILATION_ENERGY,
  VARIANT_LABEL, VARIANT_DESC,
  eV, MeV, GeV,
  // helpers
  formatEnergy, describeCard,
  identifyParticle, identifyAtom,
  pauliPenalty, freeChargeCount, heliumCount,
  // state lifecycle
  createGame, currentPlayer,
  synthesizeParticle, synthesizeAtom, decayTritium,
  annihilatePair, toggleAnion,
  endSynthesis, endTurn, beginTurn, endGame, winners,
};
