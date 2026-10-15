/**
 * save.js — 進行状況と設定の保存 (localStorage)
 *
 * 保存が失敗する環境 (プライベートモード等) でも落ちないことを最優先する。
 */
const KEY = 'honshitsu_danmaku2.v1';

const DEFAULT = {
  cleared: {},          // { stageKey: true } クリア済みの幕
  best: null,           // { stage, phases, score, diff }
  resume: null,         // { stageIndex, phaseIndex, diffKey }
  settings: {
    volume: 0.85,
    muted: false,
    reducedFx: false,
    shake: 1,
  },
  seenHelp: false,
  playCount: 0,
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

let store = null;

export function loadSave() {
  if (store) return store;
  store = clone(DEFAULT);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      store = { ...store, ...parsed, settings: { ...store.settings, ...(parsed.settings || {}) } };
    }
  } catch (e) {
    console.warn('[save] 読み込みに失敗しました。既定値で続行します。', e);
  }
  return store;
}

export function save() {
  if (!store) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('[save] 保存に失敗しました。', e);
  }
}

export function markStageCleared(stageKey) {
  const s = loadSave();
  s.cleared[stageKey] = true;
  save();
}

export function setResume(stageIndex, phaseIndex, diffKey) {
  const s = loadSave();
  s.resume = { stageIndex, phaseIndex, diffKey, at: Date.now() };
  save();
}

export function clearResume() {
  const s = loadSave();
  s.resume = null;
  save();
}

export function updateBest(rec) {
  const s = loadSave();
  if (!s.best) { s.best = rec; save(); return true; }
  const score = (r) => (r.stage || 0) * 1e7 + (r.phases || 0) * 1e5 + (r.score || 0) / 1e5;
  if (score(rec) > score(s.best)) { s.best = rec; save(); return true; }
  return false;
}

export function setSetting(k, v) {
  const s = loadSave();
  s.settings[k] = v;
  save();
}

export function bumpPlayCount() {
  const s = loadSave();
  s.playCount = (s.playCount || 0) + 1;
  save();
}

export function getSettings() { return loadSave().settings; }
export function getSave() { return loadSave(); }
