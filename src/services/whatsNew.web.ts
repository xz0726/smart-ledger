/** web 的 settingsMap 只在内存里（刷新即丢），「已读版本」改用 localStorage 持久化 */
const KEY = 'smartledger.whats_new_seen_version';

export async function getSeenVersion(): Promise<string | null> {
  try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; }
}

export async function setSeenVersion(version: string): Promise<void> {
  try { globalThis.localStorage?.setItem(KEY, version); } catch {}
}
