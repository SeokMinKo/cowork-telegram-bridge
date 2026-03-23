import { markHandled } from "../store/handled";
import { deletePending } from "../store/pending";

export interface MarkHandledInput { message_id: number; chat_id: number; project_id?: string; result?: string; }

export async function markHandledTool(input: MarkHandledInput) {
  const now = new Date().toISOString();
  deletePending(input.message_id, input.chat_id);
  markHandled({ message_id: input.message_id, chat_id: input.chat_id, project_id: input.project_id, result: input.result });
  return { success: true, handled_at: now };
}
