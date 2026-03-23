import { getDb } from "./db";

export function getMeta(key: string): string | null {
  const row = getDb().query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | null;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb().run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value]);
}

export function getPollOffset(): number {
  return parseInt(getMeta("poll_offset") ?? "0", 10);
}

export function setPollOffset(offset: number): void {
  setMeta("poll_offset", String(offset));
}
