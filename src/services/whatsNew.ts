import { getSetting, setSetting } from './db';

const KEY = 'whats_new_seen_version';

/** 已读「更新介绍」的版本（原生端存 SQLite settings 表，随备份导出） */
export async function getSeenVersion(): Promise<string | null> {
  return getSetting(KEY);
}

export async function setSeenVersion(version: string): Promise<void> {
  await setSetting(KEY, version);
}
