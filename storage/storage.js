import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../utils/constants.js";

export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS, ...settings }
  });
}

export async function clearSettings() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.LAST_SYNC,
    STORAGE_KEYS.SYNC_HISTORY,
    STORAGE_KEYS.PROBLEM_STATS,
    STORAGE_KEYS.PENDING_SOLUTION,
    STORAGE_KEYS.LAST_ERROR
  ]);
  await clearAuthSession();
}

export async function savePendingSolution(solution) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.PENDING_SOLUTION]: solution
  });
}

export async function getPendingSolution() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_SOLUTION);
  return result[STORAGE_KEYS.PENDING_SOLUTION] || null;
}

export async function clearPendingSolution() {
  await chrome.storage.local.remove(STORAGE_KEYS.PENDING_SOLUTION);
}

export async function saveLastSync(lastSync) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LAST_SYNC]: lastSync
  });
}

export async function getLastSync() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_SYNC);
  return result[STORAGE_KEYS.LAST_SYNC] || null;
}

export async function addSyncHistoryItem(entry) {
  const existing = await getSyncHistory();
  const next = [entry, ...existing].slice(0, 10);
  await chrome.storage.local.set({
    [STORAGE_KEYS.SYNC_HISTORY]: next
  });
}

export async function getSyncHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_HISTORY);
  return result[STORAGE_KEYS.SYNC_HISTORY] || [];
}

export async function getProblemStats() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PROBLEM_STATS);
  return result[STORAGE_KEYS.PROBLEM_STATS] || {};
}

export async function saveProblemStats(stats) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.PROBLEM_STATS]: stats
  });
}

export async function saveLastError(errorMessage) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LAST_ERROR]: errorMessage
  });
}

export async function getLastError() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_ERROR);
  return result[STORAGE_KEYS.LAST_ERROR] || null;
}

export async function saveAuthSession(session) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.AUTH_SESSION]: session
  });
}

export async function getAuthSession() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.AUTH_SESSION);
  return result[STORAGE_KEYS.AUTH_SESSION] || null;
}

export async function clearAuthSession() {
  await chrome.storage.local.remove(STORAGE_KEYS.AUTH_SESSION);
}
