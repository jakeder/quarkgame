// Small localStorage-backed settings store. Persists immediately on each
// set(); subscribers fire so the UI can re-render. Falls back to defaults
// if localStorage is disabled (e.g. private mode in some browsers).

const KEY = 'quarkgame.settings.v1';
const DEFAULTS = {
  theme: 'cyan',
  rememberNames: true,
  lastNames: [],
  // Per-game amounts: the setup screen pre-fills from these at page load.
  defaultPlayerCount: 4,
  defaultStartHand: 3,
  defaultDrawSize: 3,
  defaultMaxRounds: 10,
  defaultHandLimitOn: false,
  defaultHandLimit: 7,
  // Exchange mode: configured only here (persistent across games).
  exchangeOn: false,
  exchangeDiscard: 1,
  exchangeDraw: 1,
};

const VALID_THEMES = ['cyan', 'green', 'amber', 'violet'];

// Clamp a numeric field to a sane range; falls back to default if NaN.
function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) || {};
    const merged = { ...DEFAULTS, ...parsed };
    // Guard against tampered/old values that would brick the UI.
    if (!VALID_THEMES.includes(merged.theme)) merged.theme = DEFAULTS.theme;
    if (!Array.isArray(merged.lastNames)) merged.lastNames = [];
    merged.defaultPlayerCount = clampNum(merged.defaultPlayerCount, 2, 6, DEFAULTS.defaultPlayerCount);
    merged.defaultStartHand   = clampNum(merged.defaultStartHand, 1, 20, DEFAULTS.defaultStartHand);
    merged.defaultDrawSize    = clampNum(merged.defaultDrawSize, 1, 10, DEFAULTS.defaultDrawSize);
    merged.defaultMaxRounds   = clampNum(merged.defaultMaxRounds, 3, 20, DEFAULTS.defaultMaxRounds);
    merged.defaultHandLimit   = clampNum(merged.defaultHandLimit, 1, 20, DEFAULTS.defaultHandLimit);
    merged.exchangeDiscard    = clampNum(merged.exchangeDiscard, 1, 20, DEFAULTS.exchangeDiscard);
    merged.exchangeDraw       = clampNum(merged.exchangeDraw, 1, 20, DEFAULTS.exchangeDraw);
    merged.defaultHandLimitOn = !!merged.defaultHandLimitOn;
    merged.exchangeOn         = !!merged.exchangeOn;
    return merged;
  } catch (_) {
    return { ...DEFAULTS };
  }
}

let current = load();
const subs = new Set();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (_) {}
}

function get(key) { return current[key]; }
function getAll() { return { ...current }; }
function set(key, value) {
  current[key] = value;
  persist();
  applyTheme();
  for (const fn of subs) fn(current);
}
function setMany(patch) {
  Object.assign(current, patch);
  persist();
  applyTheme();
  for (const fn of subs) fn(current);
}
function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
function reset() {
  current = { ...DEFAULTS };
  try { localStorage.removeItem(KEY); } catch (_) {}
  applyTheme();
  for (const fn of subs) fn(current);
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', current.theme);
}

// Apply theme as early as possible so first paint already matches.
applyTheme();

window.Settings = { get, getAll, set, setMany, subscribe, reset, VALID_THEMES };
