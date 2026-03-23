import { sendText } from "../telegram/client";
import { chunkText } from "../telegram/chunker";

export interface SendMessageInput { chat_id: number; text: string; thread_id?: number; reply_to?: number; }

export async function sendMessage(input: SendMessageInput) {
  if (!input.text.trim()) throw new Error("텍스트가 비어있습니다");
  const chunks = chunkText(input.text);
  let lastId = 0;
  for (const chunk of chunks) {
    const res = await sendText({ chat_id: input.chat_id, text: chunk, thread_id: input.thread_id, reply_to: input.reply_to });
    lastId = res.message_id;
  }
  return { message_id: lastId, chunk_count: chunks.length, success: true };
}
