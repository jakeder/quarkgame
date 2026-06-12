// Small localStorage-backed settings store. Persists immediately on each
// set(); subscribers fire so the UI can re-render. Falls back to defaults
// if localStorage is disabled (e.g. private mode in some browsers).

const KEY = 'quarkgame.settings.v1';
const DEFAULTS = {
  theme: 'cyan',
  rememberNames: true,
  lastNames: [],
};

const VALID_THEMES = ['cyan', 'green', 'amber', 'violet'];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) || {};
    const merged = { ...DEFAULTS, ...parsed };
    // Guard against tampered/old values that would brick the UI.
    if (!VALID_THEMES.includes(merged.theme)) merged.theme = DEFAULTS.theme;
    if (!Array.isArray(merged.lastNames)) merged.lastNames = [];
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
