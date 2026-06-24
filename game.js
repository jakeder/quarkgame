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
// require one card of each color (RGB) — Gell-Mann's Gimmick. Advanced game
// adds anti-baryons (anti=true): mirror compositions with anti-quarks, and
// decays produce an anti-proton + electrons/positrons swapped per the rulebook.
const PARTICLE_RULES = [
  { type: 'proton',  flavors: { u: 2, d: 1 }, spin: 'mixed',   energy: 938 * MeV,  stable: true,  decay: null,                                                       anti: false },
  { type: 'neutron', flavors: { u: 1, d: 2 }, spin: 'mixed',   energy: 940 * MeV,  stable: false, decay: { electrons: 1, positrons: 0, delayed: true  },             anti: false },
  { type: 'delta++', flavors: { u: 3, d: 0 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 0, positrons: 1, delayed: false },             anti: false },
  { type: 'delta+',  flavors: { u: 2, d: 1 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 0, positrons: 0, delayed: false },             anti: false },
  { type: 'delta0',  flavors: { u: 1, d: 2 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 1, positrons: 0, delayed: false },             anti: false },
  { type: 'delta-',  flavors: { u: 0, d: 3 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 2, positrons: 0, delayed: false },             anti: false },
  // ── Advanced (anti) ────────────────────────────────────────────────────────
  { type: 'antiproton',   flavors: { u: 2, d: 1 }, spin: 'mixed',   energy: 938 * MeV,  stable: true,  decay: null,                                                  anti: true  },
  { type: 'antineutron',  flavors: { u: 1, d: 2 }, spin: 'mixed',   energy: 940 * MeV,  stable: false, decay: { electrons: 0, positrons: 1, delayed: true  },        anti: true  },
  { type: 'antidelta++',  flavors: { u: 3, d: 0 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 1, positrons: 0, delayed: false },        anti: true  },
  { type: 'antidelta+',   flavors: { u: 2, d: 1 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 0, positrons: 0, delayed: false },        anti: true  },
  { type: 'antidelta0',   flavors: { u: 1, d: 2 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 0, positrons: 1, delayed: false },        anti: true  },
  { type: 'antidelta-',   flavors: { u: 0, d: 3 }, spin: 'aligned', energy: 1230 * MeV, stable: false, decay: { electrons: 0, positrons: 2, delayed: false },        anti: true  },
];

const PARTICLE_LABEL = {
  'proton':  'Proton (p⁺)',
  'neutron': 'Neutron (n⁰)',
  'delta++': 'Delta⁺⁺ (Δ⁺⁺)',
  'delta+':  'Delta⁺ (Δ⁺)',
  'delta0':  'Delta⁰ (Δ⁰)',
  'delta-':  'Delta⁻ (Δ⁻)',
  'antiproton':  'Anti-Proton (p̄⁻)',
  'antineutron': 'Anti-Neutron (n̄⁰)',
  'antidelta++': 'Anti-Delta⁻⁻ (Δ̄⁻⁻)',
  'antidelta+':  'Anti-Delta⁻ (Δ̄⁻)',
  'antidelta0':  'Anti-Delta⁰ (Δ̄⁰)',
  'antidelta-':  'Anti-Delta⁺ (Δ̄⁺)',
  'pi+': 'Pi Plus (π⁺)',
  'pi-': 'Pi Minus (π⁻)',
  'pi0': 'Pi Zero (π⁰)',
};

// Meson (pion) recipes. 2 cards = 1 quark + 1 anti-quark of matching color
// letter (red+anti-red ⇒ colorless) and different spins.
const MESON_RULES = [
  { type: 'pi+', q: { flavor: 'u', anti: false }, aq: { flavor: 'd', anti: true  }, energy: 140 * MeV, decay: { electrons: 0, positrons: 1 } },
  { type: 'pi-', q: { flavor: 'd', anti: false }, aq: { flavor: 'u', anti: true  }, energy: 140 * MeV, decay: { electrons: 1, positrons: 0 } },
  // Pi-zero: two ways to make it (uū or dd̄). Both are the same particle.
  { type: 'pi0', q: { flavor: 'u', anti: false }, aq: { flavor: 'u', anti: true  }, energy: 135 * MeV, decay: { electrons: 0, positrons: 0 } },
  { type: 'pi0', q: { flavor: 'd', anti: false }, aq: { flavor: 'd', anti: true  }, energy: 135 * MeV, decay: { electrons: 0, positrons: 0 } },
];

// Atom recipes. spinSumCheck takes the literal sum of quark spins (+1 per up,
// -1 per down). The He-4 sum is always even (12 spins of ±1), so the
// rulebook's "0 or ±1" reduces in practice to 0 — kept literal in code.
// Advanced game adds anti-atoms: mirror compositions (anti-protons +
// anti-neutrons + positrons in place of electrons) with the same energies.
const ATOM_RULES = [
  { type: 'H',   protons: 1, neutrons: 0, electrons: 1, energy: 13.6 * eV,    spinSumCheck: () => true,                                 stable: true,  anti: false },
  { type: 'D',   protons: 1, neutrons: 1, electrons: 1, energy: 2.22 * MeV,   spinSumCheck: (s) => s === 0,                             stable: true,  anti: false },
  { type: 'T',   protons: 1, neutrons: 2, electrons: 1, energy: 8.48 * MeV,   spinSumCheck: (s) => s === 1 || s === -1,                 stable: false, anti: false },
  { type: 'He3', protons: 2, neutrons: 1, electrons: 2, energy: 7.72 * MeV,   spinSumCheck: (s) => s === 1 || s === -1,                 stable: true,  anti: false },
  { type: 'He4', protons: 2, neutrons: 2, electrons: 2, energy: 28.3 * MeV,   spinSumCheck: (s) => s === -1 || s === 0 || s === 1,      stable: true,  anti: false },
  // ── Advanced (anti) ────────────────────────────────────────────────────────
  // For anti-atoms the "protons/neutrons" counts mean anti-protons / anti-neutrons
  // and "electrons" means positrons.
  { type: 'antiH',   protons: 1, neutrons: 0, electrons: 1, energy: 13.6 * eV,    spinSumCheck: () => true,                                 stable: true,  anti: true },
  { type: 'antiD',   protons: 1, neutrons: 1, electrons: 1, energy: 2.22 * MeV,   spinSumCheck: (s) => s === 0,                             stable: true,  anti: true },
  { type: 'antiT',   protons: 1, neutrons: 2, electrons: 1, energy: 8.48 * MeV,   spinSumCheck: (s) => s === 1 || s === -1,                 stable: false, anti: true },
  { type: 'antiHe3', protons: 2, neutrons: 1, electrons: 2, energy: 7.72 * MeV,   spinSumCheck: (s) => s === 1 || s === -1,                 stable: true,  anti: true },
  { type: 'antiHe4', protons: 2, neutrons: 2, electrons: 2, energy: 28.3 * MeV,   spinSumCheck: (s) => s === -1 || s === 0 || s === 1,      stable: true,  anti: true },
];

const ATOM_LABEL = {
  'H':   'Hydrogen (H)',
  'D':   'Deuterium (²H)',
  'T':   'Tritium (³H)',
  'He3': 'Helium-3 (³He)',
  'He4': 'Helium-4 (⁴He)',
  'antiH':   'Anti-Hydrogen (H̄)',
  'antiD':   'Anti-Deuterium (²H̄)',
  'antiT':   'Anti-Tritium (³H̄)',
  'antiHe3': 'Anti-Helium-3 (³H̄e)',
  'antiHe4': 'Anti-Helium-4 (⁴H̄e)',
};

const ANTIPARTICLE_OF = {
  // Atom ↔ anti-atom pairing for "Nothing Left Behind" annihilation.
  'H':       'antiH',   'antiH':   'H',
  'D':       'antiD',   'antiD':   'D',
  'T':       'antiT',   'antiT':   'T',
  'He3':     'antiHe3', 'antiHe3': 'He3',
  'He4':     'antiHe4', 'antiHe4': 'He4',
  // Particle ↔ anti-particle pairing too (used by Nothing Left Behind).
  'proton':      'antiproton',  'antiproton':  'proton',
  'neutron':     'antineutron', 'antineutron': 'neutron',
  'delta++':     'antidelta++', 'antidelta++': 'delta++',
  'delta+':      'antidelta+',  'antidelta+':  'delta+',
  'delta0':      'antidelta0',  'antidelta0':  'delta0',
  'delta-':      'antidelta-',  'antidelta-':  'delta-',
};

const ANNIHILATION_ENERGY = 1.02 * MeV;

// ── Optional variants (Charge Neutrality Agreement) ─────────────────────────
const VARIANT_LABEL = {
  pauli:       'Pauli Penalty',
  heliumPrize: 'Helium Prize',
  antiHero:    'Anti Hero',
  nothingLeft: 'Nothing Left Behind',
};
const VARIANT_DESC = {
  pauli:       'Pay an energy penalty each turn for free charges left in your stockpile. Annihilate positrons any time; H⁻ anions are exempt.',
  heliumPrize: 'Win by synthesizing the most Helium-3 and Helium-4 atoms (ties broken by energy) instead of the most energy.',
  antiHero:    'Advanced only. Each player picks a world (actual or anti). Only earn binding energy for creations in your world.',
  nothingLeft: 'Advanced only. Make equal numbers of particles and anti-particles. Pair them off at game end; fewest left wins (ties broken by energy).',
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
  // Free (anti-)protons + free electrons + free positrons. (Anti-)neutrons are
  // neutral. Pions briefly held during synth wouldn't normally survive into the
  // end-of-turn count (they auto-decay).
  const freeProtons = player.stockpile.particles.filter(p => p.type === 'proton' || p.type === 'antiproton').length;
  return freeProtons + player.stockpile.positrons + player.stockpile.electrons;
}

function heliumCount(player) {
  return player.stockpile.atoms.filter(a => /He3|He4/.test(a.type)).length;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(advanced) {
  // Basic: 12 distinct (2 flavors × 3 colors × 2 spins) × 4 = 48.
  // Advanced: also adds 12 anti-quark variants × 4 = 96 total. An anti-quark's
  // "color" field is the matching anti-color letter (R̄ stored as anti:true + R).
  const cards = [];
  let id = 0;
  const antis = advanced ? [false, true] : [false];
  for (const flavor of ['u', 'd']) {
    for (const color of ['R', 'G', 'B']) {
      for (const spin of ['up', 'down']) {
        for (const anti of antis) {
          for (let copy = 0; copy < 4; copy++) {
            cards.push({ id: 'c' + (id++), flavor, color, spin, anti });
          }
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

function makeSyntheticProton(state, anti) {
  // Default arrangement: u(R,up), u(G,up), d(B,down) — satisfies "two different spins".
  // Spin sum = +1 (two up, one down). anti=true mirrors to an anti-proton.
  return {
    id: nextId(state, anti ? 'ap' : 'p'),
    type: anti ? 'antiproton' : 'proton',
    cards: makeSyntheticCards(state, [
      { flavor: 'u', color: 'R', spin: 'up',   anti: !!anti },
      { flavor: 'u', color: 'G', spin: 'up',   anti: !!anti },
      { flavor: 'd', color: 'B', spin: 'down', anti: !!anti },
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
  if (cards.length === 2) return identifyMeson(cards);
  if (cards.length !== 3) {
    return { ok: false, reason: 'Select 3 cards for a baryon (or 2 quark+anti-quark for a pion in Advanced).' };
  }
  // All-quark or all-anti-quark mixes only. A real Quark + Anti-Quark + Quark is
  // not a valid baryon.
  const antis = cards.filter(c => c.anti).length;
  const isAnti = antis === 3;
  if (antis !== 0 && antis !== 3) {
    return { ok: false, reason: 'A baryon must be all quarks or all anti-quarks (not mixed).' };
  }
  if (!colorsAreRGB(cards)) {
    return { ok: false, reason: 'Need one card of each color (R, G, B) — Gell-Mann’s Gimmick.' };
  }
  const f = flavorCounts(cards);
  const aligned = spinAllSame(cards);
  for (const rule of PARTICLE_RULES) {
    if (!!rule.anti !== isAnti) continue;
    if (rule.flavors.u !== f.u || rule.flavors.d !== f.d) continue;
    if (rule.spin === 'aligned' && !aligned) continue;
    if (rule.spin === 'mixed' && aligned) continue;
    return { ok: true, rule };
  }
  return { ok: false, reason: 'These cards do not match any particle recipe.' };
}

// Pion identification: 2 cards = 1 quark + 1 anti-quark, matching color
// letters (red+anti-red is colorless), different spins. Flavor combo picks π.
function identifyMeson(cards) {
  if (cards.length !== 2) return { ok: false, reason: 'A pion is exactly 2 cards.' };
  const antis = cards.filter(c => c.anti).length;
  if (antis !== 1) return { ok: false, reason: 'A pion needs one quark and one anti-quark.' };
  const q  = cards.find(c => !c.anti);
  const aq = cards.find(c =>  c.anti);
  if (q.color !== aq.color) {
    return { ok: false, reason: 'Pion needs matching color letters: color and its anti-color (e.g. red + anti-red).' };
  }
  if (q.spin === aq.spin) {
    return { ok: false, reason: 'Pion needs two different spins.' };
  }
  for (const rule of MESON_RULES) {
    if (rule.q.flavor === q.flavor && rule.aq.flavor === aq.flavor) {
      return { ok: true, rule };
    }
  }
  return { ok: false, reason: 'No pion matches that flavor combination.' };
}

function spinSumOfParticles(particles) {
  let sum = 0;
  for (const p of particles) {
    for (const c of p.cards) sum += (c.spin === 'up' ? 1 : -1);
  }
  return sum;
}

function identifyAtom(particles, leptonCount) {
  // leptonCount = number of free electrons (regular atom) OR positrons (anti
  // atom) the player is consuming. Whether the atom is a regular atom or an
  // anti-atom is determined by the particle types.
  const protons      = particles.filter(p => p.type === 'proton').length;
  const neutrons     = particles.filter(p => p.type === 'neutron').length;
  const antiProtons  = particles.filter(p => p.type === 'antiproton').length;
  const antiNeutrons = particles.filter(p => p.type === 'antineutron').length;
  const regular = protons + neutrons;
  const anti    = antiProtons + antiNeutrons;
  if (regular > 0 && anti > 0) {
    return { ok: false, reason: 'An atom cannot mix matter and anti-matter nucleons.' };
  }
  if (regular + anti !== particles.length) {
    return { ok: false, reason: 'Atoms are built from (anti) protons and neutrons only.' };
  }
  const isAnti = anti > 0;
  const targetP = isAnti ? antiProtons  : protons;
  const targetN = isAnti ? antiNeutrons : neutrons;
  for (const rule of ATOM_RULES) {
    if (!!rule.anti !== isAnti) continue;
    if (rule.protons !== targetP || rule.neutrons !== targetN) continue;
    if (rule.electrons !== leptonCount) {
      const lep = isAnti ? 'positron' : 'electron';
      return { ok: false, reason: `${ATOM_LABEL[rule.type]} needs exactly ${rule.electrons} free ${lep}${rule.electrons === 1 ? '' : 's'}.` };
    }
    const sum = spinSumOfParticles(particles);
    if (!rule.spinSumCheck(sum)) {
      return { ok: false, reason: `Quark spin sum ${sum >= 0 ? '+' + sum : sum} does not satisfy the ${ATOM_LABEL[rule.type]} constraint.` };
    }
    return { ok: true, rule, spinSum: sum, isAnti };
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
  const flavor = card.anti ? 'anti-' + FLAVOR_LABEL[card.flavor] : FLAVOR_LABEL[card.flavor];
  const color  = card.anti ? 'anti-' + COLOR_LABEL[card.color]  : COLOR_LABEL[card.color];
  return `${flavor} ${color} ${card.spin}`;
}

function createGame(playerNames, opts) {
  const o = opts || {};
  const drawSize  = o.drawSize  != null ? o.drawSize  : 3;
  const maxRounds = o.maxRounds != null ? o.maxRounds : 10;
  // Starting hand size: each player's first draw uses this; subsequent draws
  // use drawSize. Defaults to drawSize so existing setups behave identically.
  const startHand = (o.startHand != null && o.startHand > 0) ? o.startHand : drawSize;
  // Hand limit: a positive number caps the hand; null/0 means no limit.
  const handLimit = (o.handLimit != null && o.handLimit > 0) ? o.handLimit : null;
  // Exchange mode: discard N cards to draw M, any time on your turn. null = off.
  const exchange = (o.exchange && o.exchange.discard > 0 && o.exchange.draw > 0)
    ? { discard: o.exchange.discard, draw: o.exchange.draw }
    : null;
  // Draw-at-end-of-turn mode: each player draws their next-turn hand at the
  // end of the current turn (after decays) instead of at the start of the next.
  // All players also get startHand at game start. Used in online mode so
  // waiting players can see and plan with their next hand.
  const drawAtEnd = !!o.drawAtEnd;
  const advanced  = !!o.advanced;
  const rng       = o.rng || Math.random;
  const variants = {
    pauli:       !!(o.variants && o.variants.pauli),
    heliumPrize: !!(o.variants && o.variants.heliumPrize),
    // Advanced-only variants. Each player can pick a world (Anti Hero) — set
    // per-player below.
    antiHero:    !!(o.variants && o.variants.antiHero) && advanced,
    nothingLeft: !!(o.variants && o.variants.nothingLeft) && advanced,
  };
  // Anti Hero: each player declares 'actual' or 'anti' world at start. If the
  // host passes worlds, honor; else default everyone to 'actual'.
  const worlds = (o.worlds && Array.isArray(o.worlds)) ? o.worlds : null;
  const state = {
    _nextId: 1,
    deck: shuffle(buildDeck(advanced), rng),
    discardPile: [],
    players: playerNames.map((name, i) => ({
      id: i,
      name,
      hand: [],
      hasOpened: false,
      stockpile: { particles: [], atoms: [], electrons: 0, positrons: 0 },
      energy: 0,
      log: [],
      annihilations: 0,
      // Anti Hero variant: which world this player lives in.
      world: variants.antiHero ? (worlds && worlds[i] === 'anti' ? 'anti' : 'actual') : 'both',
    })),
    currentPlayer: 0,
    turn: 1,           // global turn counter (increments every player change)
    round: 1,          // increments when player index wraps to 0
    phase: 'synthesize',  // 'synthesize' | 'decays' | 'between' | 'over'
    config: { drawSize, startHand, maxRounds, handLimit, exchange, drawAtEnd, advanced, variants },
    lastDecayEvents: [],
    lastSynthEvents: [],
    lastPenalty: null,
  };
  // Initial draw. In draw-at-end mode deal startHand to ALL players up front
  // so each can see/plan their hand while waiting for their first turn.
  if (drawAtEnd) {
    for (let i = 0; i < state.players.length; i++) {
      state.currentPlayer = i;
      drawForCurrentPlayer(state);
    }
    state.currentPlayer = 0;
  } else {
    drawForCurrentPlayer(state);
  }
  return state;
}

function currentPlayer(state) {
  return state.players[state.currentPlayer];
}

function drawForCurrentPlayer(state) {
  const p = currentPlayer(state);
  // First time we deal to this player, give startHand; subsequent turns give
  // drawSize. Old states without startHand fall back to drawSize.
  const startHand = (state.config.startHand != null && state.config.startHand > 0)
    ? state.config.startHand
    : state.config.drawSize;
  const size = p.hasOpened ? state.config.drawSize : startHand;
  const n = Math.min(size, state.deck.length);
  for (let i = 0; i < n; i++) {
    p.hand.push(state.deck.pop());
  }
  p.hasOpened = true;
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
  // Pion (meson) path: 2 cards. Awards energy but auto-decays during the decays
  // phase per the rulebook (returns the cards "to the bank" — we just drop them).
  if (cards.length === 2) {
    const meson = {
      id: nextId(state, 'm'),
      type: r.rule.type,
      cards,
      decay: r.rule.decay,
      createdTurn: state.turn,
      synthetic: false,
    };
    p.stockpile.particles.push(meson);
    const gained = worldGainFor(state, p, r.rule);
    p.energy += gained;
    const event = { kind: 'synth-meson', particleType: r.rule.type, energy: gained, particleId: meson.id };
    p.log.push(event);
    state.lastSynthEvents.push(event);
    return { ok: true, particle: meson, energy: gained };
  }
  // Baryon / anti-baryon path: 3 cards.
  const particle = {
    id: nextId(state, r.rule.anti ? 'ap' : 'p'),
    type: r.rule.type,
    cards,
    catMarker: false,
    catPlacedTurn: null,
    createdTurn: state.turn,
    synthetic: false,
  };
  p.stockpile.particles.push(particle);
  const gained = worldGainFor(state, p, r.rule);
  p.energy += gained;
  const event = { kind: 'synth-particle', particleType: r.rule.type, energy: gained, particleId: particle.id };
  p.log.push(event);
  state.lastSynthEvents.push(event);
  return { ok: true, particle, energy: gained };
}

// Anti Hero: a player only collects binding energy for creations matching
// their world. Returns the actual gain (0 if wrong world).
function worldGainFor(state, player, rule) {
  if (!state.config.variants.antiHero) return rule.energy;
  if (player.world === 'both' || player.world == null) return rule.energy;
  const wantsAnti = player.world === 'anti';
  return (!!rule.anti === wantsAnti) ? rule.energy : 0;
}

function synthesizeAtom(state, particleIds, leptonCount) {
  if (state.phase !== 'synthesize') return { ok: false, error: 'Not in synthesize phase.' };
  const p = currentPlayer(state);
  const particles = particleIds.map(id => p.stockpile.particles.find(x => x.id === id)).filter(Boolean);
  if (particles.length !== particleIds.length) return { ok: false, error: 'One or more selected particles are not free in your stockpile.' };
  if (leptonCount < 0) return { ok: false, error: 'Lepton count cannot be negative.' };
  const r = identifyAtom(particles, leptonCount);
  if (!r.ok) return { ok: false, error: r.reason };
  // Anti-atoms consume positrons (in place of electrons) per the rulebook.
  const pool = r.isAnti ? p.stockpile.positrons : p.stockpile.electrons;
  const lepLabel = r.isAnti ? 'positron' : 'electron';
  if (pool < leptonCount) return { ok: false, error: `You only have ${pool} free ${lepLabel}${pool === 1 ? '' : 's'}.` };
  // Consume particles + leptons; create atom.
  p.stockpile.particles = p.stockpile.particles.filter(x => !particleIds.includes(x.id));
  if (r.isAnti) p.stockpile.positrons -= leptonCount;
  else          p.stockpile.electrons -= leptonCount;
  const atom = {
    id: nextId(state, r.isAnti ? 'aa' : 'a'),
    type: r.rule.type,
    particles,
    electrons: leptonCount,        // "electrons" in the atom struct means leptons used (e- OR e+)
    energy: r.rule.energy,
    createdTurn: state.turn,
    spinSum: r.spinSum,
  };
  p.stockpile.atoms.push(atom);
  const gained = worldGainFor(state, p, r.rule);
  p.energy += gained;
  const event = { kind: 'synth-atom', atomType: r.rule.type, energy: gained, atomId: atom.id };
  p.log.push(event);
  state.lastSynthEvents.push(event);
  return { ok: true, atom, energy: gained };
}

function decayTritium(state, atomId) {
  if (state.phase !== 'synthesize') return { ok: false, error: 'Tritium can only be decayed during the synthesize phase.' };
  const p = currentPlayer(state);
  const atom = p.stockpile.atoms.find(a => a.id === atomId);
  if (!atom) return { ok: false, error: 'Atom not found in your stockpile.' };
  const isAnti = atom.type === 'antiT';
  if (atom.type !== 'T' && !isAnti) return { ok: false, error: 'Only Tritium or Anti-Tritium can be voluntarily decayed.' };
  // One bound (anti-)neutron decays into a (anti-)proton; atom becomes
  // (Anti-)Helium-3; player gains 1 free electron (or positron for anti).
  const nType = isAnti ? 'antineutron' : 'neutron';
  const ni = atom.particles.findIndex(x => x.type === nType);
  if (ni === -1) return { ok: false, error: 'No (anti-)neutron available in this atom (corrupted state).' };
  const newProton = makeSyntheticProton(state, isAnti);
  atom.particles.splice(ni, 1, newProton);
  atom.type = isAnti ? 'antiHe3' : 'He3';
  atom.electrons = 2;
  atom.energy = ATOM_RULES.find(a => a.type === atom.type).energy;
  atom.spinSum = spinSumOfParticles(atom.particles);
  if (isAnti) p.stockpile.positrons += 1; else p.stockpile.electrons += 1;
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

// Hand limit helpers. handLimit is null when the variant is off.
function handLimitOf(state) {
  const h = state.config.handLimit;
  return (typeof h === 'number' && h > 0) ? h : null;
}

// How many cards the current player must still discard (0 if none / no limit).
function discardRequired(state) {
  const lim = handLimitOf(state);
  if (lim == null) return 0;
  return Math.max(0, currentPlayer(state).hand.length - lim);
}

// Discard one card from the current player's hand to the discard pile. Only
// allowed at the end of the turn (decays phase), before passing.
function discardCard(state, cardId) {
  if (state.phase !== 'decays') return { ok: false, error: 'Discard at the end of your turn, after ending synthesis.' };
  if (handLimitOf(state) == null) return { ok: false, error: 'No hand limit is in play.' };
  const p = currentPlayer(state);
  const idx = p.hand.findIndex(c => c.id === cardId);
  if (idx === -1) return { ok: false, error: 'That card is not in your hand.' };
  const [card] = p.hand.splice(idx, 1);
  state.discardPile.push(card);
  return { ok: true, remaining: discardRequired(state) };
}

// Exchange mode config (null when off).
function exchangeConfig(state) {
  const e = state.config.exchange;
  return (e && e.discard > 0 && e.draw > 0) ? e : null;
}

// Exchange: discard exactly `discard` selected cards, then draw `draw` new ones.
// Available any number of times during your synthesize phase.
function exchangeCards(state, cardIds) {
  if (state.phase !== 'synthesize') return { ok: false, error: 'Exchange during the synthesize phase.' };
  const cfg = exchangeConfig(state);
  if (!cfg) return { ok: false, error: 'Exchange mode is not enabled.' };
  const p = currentPlayer(state);
  if (cardIds.length !== cfg.discard) {
    return { ok: false, error: 'Select exactly ' + cfg.discard + ' card' + (cfg.discard === 1 ? '' : 's') + ' to exchange.' };
  }
  const cards = cardIds.map(id => p.hand.find(c => c.id === id)).filter(Boolean);
  if (cards.length !== cardIds.length) return { ok: false, error: 'One or more selected cards are not in your hand.' };
  if (state.deck.length === 0) return { ok: false, error: 'The deck is empty — nothing to draw.' };
  // Discard the selected cards.
  p.hand = p.hand.filter(c => !cardIds.includes(c.id));
  for (const c of cards) state.discardPile.push(c);
  // Draw up to `draw` new cards.
  const drawN = Math.min(cfg.draw, state.deck.length);
  for (let i = 0; i < drawN; i++) p.hand.push(state.deck.pop());
  p.log.push({ kind: 'exchange', discarded: cards.length, drawn: drawN });
  return { ok: true, discarded: cards.length, drawn: drawN };
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

  // 0. Pion decays (Advanced). All pions in the stockpile decay immediately:
  //    pi+ → +1 positron, pi- → +1 electron, pi0 → nothing. Cards are dropped.
  const pions = p.stockpile.particles.filter(x => x.type === 'pi+' || x.type === 'pi-' || x.type === 'pi0');
  for (const pi of pions) {
    p.stockpile.particles = p.stockpile.particles.filter(x => x.id !== pi.id);
    const d = pi.decay || { electrons: 0, positrons: 0 };
    p.stockpile.electrons += d.electrons;
    p.stockpile.positrons += d.positrons;
    events.push({
      kind: 'decay', from: pi.type, to: 'leptons',
      gainedElectrons: d.electrons, gainedPositrons: d.positrons,
    });
  }

  // 1. Forced decay of all Delta and Anti-Delta particles in this player's stockpile.
  const deltas = p.stockpile.particles.filter(x => x.type.startsWith('delta') || x.type.startsWith('antidelta'));
  for (const d of deltas) {
    const rule = PARTICLE_RULES.find(r => r.type === d.type);
    p.stockpile.particles = p.stockpile.particles.filter(x => x.id !== d.id);
    const isAnti = !!rule.anti;
    const proton = makeSyntheticProton(state, isAnti);
    p.stockpile.particles.push(proton);
    p.stockpile.electrons += rule.decay.electrons;
    p.stockpile.positrons += rule.decay.positrons;
    events.push({
      kind: 'decay',
      from: d.type, to: isAnti ? 'antiproton' : 'proton',
      gainedElectrons: rule.decay.electrons,
      gainedPositrons: rule.decay.positrons,
    });
  }

  // 2. Cat-marked (anti-)neutrons whose cat was placed in a prior turn-of-this-player decay.
  //    catPlacedTurn was set on this player's previous turn; a full round
  //    (numPlayers turns) elapses before the marker triggers.
  const toDecay = p.stockpile.particles.filter(
    n => (n.type === 'neutron' || n.type === 'antineutron')
      && n.catMarker && (state.turn - n.catPlacedTurn) >= numPlayers
  );
  for (const n of toDecay) {
    const isAnti = n.type === 'antineutron';
    p.stockpile.particles = p.stockpile.particles.filter(x => x.id !== n.id);
    const proton = makeSyntheticProton(state, isAnti);
    p.stockpile.particles.push(proton);
    if (isAnti) p.stockpile.positrons += 1; else p.stockpile.electrons += 1;
    events.push({
      kind: 'decay',
      from: n.type, to: isAnti ? 'antiproton' : 'proton',
      gainedElectrons: isAnti ? 0 : 1, gainedPositrons: isAnti ? 1 : 0,
    });
  }

  // 3. Place cat marker on any free (anti-)neutron without one.
  for (const n of p.stockpile.particles) {
    if ((n.type === 'neutron' || n.type === 'antineutron') && !n.catMarker) {
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
  // Enforce the hand limit: the player must discard down to it before passing.
  const over = discardRequired(state);
  if (over > 0) {
    return { ok: false, error: 'Discard down to ' + handLimitOf(state) + ' cards before ending your turn (' + over + ' over).', needsDiscard: over };
  }
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
  // Draw-at-end-of-turn: now (AFTER the hand-limit discard check) deal the
  // ending player their next-turn hand. They may end up over the hand limit
  // after this; that's intentional — the player gets to use the new cards next
  // turn and only has to discard at the END of that turn (against the played-
  // down hand again).
  if (state.config.drawAtEnd) drawForCurrentPlayer(state);
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
  // In draw-at-end mode the player's hand was already drawn at the end of their
  // previous turn (or at game start for round 1) — don't draw again.
  if (!state.config.drawAtEnd) drawForCurrentPlayer(state);
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
  // Nothing Left Behind (Advanced variant): pair each free particle with its
  // anti-particle and remove the pair. Same for atoms vs anti-atoms. We track
  // the count of particles left for the win check.
  if (state.config.variants.nothingLeft) {
    for (const p of state.players) {
      const pairedAtoms = pairOffByAntiparticle(p.stockpile.atoms, x => x.type);
      p.stockpile.atoms = pairedAtoms.kept;
      const pairedParts = pairOffByAntiparticle(p.stockpile.particles, x => x.type);
      p.stockpile.particles = pairedParts.kept;
      p.particlesLeft =
        p.stockpile.atoms.length + p.stockpile.particles.length +
        p.stockpile.electrons + p.stockpile.positrons;
      const removed = pairedAtoms.removed + pairedParts.removed;
      if (removed > 0) {
        p.log.push({ kind: 'nlb-annihilation', pairsRemoved: removed });
      }
    }
  }
  state.phase = 'over';
}

// Pair off items whose types are antiparticles of each other (per
// ANTIPARTICLE_OF). Returns the still-unmatched items plus the count of
// removed pairs.
function pairOffByAntiparticle(items, typeOf) {
  const byType = new Map();
  let removed = 0;
  for (const it of items) {
    const t = typeOf(it);
    const anti = ANTIPARTICLE_OF[t];
    const bucket = anti && byType.get(anti);
    if (bucket && bucket.length > 0) {
      bucket.pop();
      removed++;
      continue;
    }
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(it);
  }
  const kept = [];
  for (const bucket of byType.values()) kept.push(...bucket);
  return { kept, removed };
}

function winners(state) {
  if (!state.players.length) return [];
  const v = state.config.variants || {};
  // Nothing Left Behind: fewest particles left wins; ties broken by energy.
  if (v.nothingLeft) {
    const minLeft = Math.min(...state.players.map(p => p.particlesLeft != null ? p.particlesLeft : (p.stockpile.atoms.length + p.stockpile.particles.length + p.stockpile.electrons + p.stockpile.positrons)));
    let top = state.players.filter(p => (p.particlesLeft != null ? p.particlesLeft : (p.stockpile.atoms.length + p.stockpile.particles.length + p.stockpile.electrons + p.stockpile.positrons)) === minLeft);
    if (top.length > 1) {
      const maxE = Math.max(...top.map(p => p.energy));
      top = top.filter(p => p.energy === maxE);
    }
    return top;
  }
  // Helium Prize: most He-3/He-4 atoms wins; ties broken by energy.
  if (v.heliumPrize) {
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
  MESON_RULES, ATOM_RULES, ATOM_LABEL,
  ANTIPARTICLE_OF,
  ANNIHILATION_ENERGY,
  VARIANT_LABEL, VARIANT_DESC,
  eV, MeV, GeV,
  // helpers
  formatEnergy, describeCard,
  identifyParticle, identifyMeson, identifyAtom,
  pauliPenalty, freeChargeCount, heliumCount,
  handLimitOf, discardRequired,
  // state lifecycle
  createGame, currentPlayer,
  synthesizeParticle, synthesizeAtom, decayTritium,
  annihilatePair, toggleAnion, discardCard,
  exchangeConfig, exchangeCards,
  endSynthesis, endTurn, beginTurn, endGame, winners,
};
