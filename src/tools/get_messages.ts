import { getPending } from "../store/pending";

export interface GetMessagesInput { project_id?: string; limit?: number; since_min?: number; }

export async function getMessages(input: GetMessagesInput) {
  const rows = getPending({ project_id: input.project_id, limit: input.limit ?? 20, since_min: input.since_min });
  return { messages: rows.map(r => ({ ...r })), count: rows.length, fetched_at: new Date().toISOString() };
}
