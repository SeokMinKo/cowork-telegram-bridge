import { statSync, existsSync } from "fs";
import { resolve } from "path";
import { getBotInfo } from "../telegram/client";
import { countPending } from "../store/pending";
import { getMeta } from "../store/meta";

const SERVER_START = Date.now();

export async function getBotStatus() {
  const info    = await getBotInfo();
  const dbPath  = resolve((process.env.DB_PATH ?? "./data/bridge.db").replace(/^~/, process.env.HOME ?? ""));
  const dbSize  = existsSync(dbPath) ? Math.round(statSync(dbPath).size / 1024) : 0;
  return {
    bot_id: info.id, username: info.username, is_connected: true,
    pending_count: countPending(),
    last_poll_at: getMeta("last_poll_at"),
    uptime_min: Math.floor((Date.now() - SERVER_START) / 60000),
    db_size_kb: dbSize,
  };
}
