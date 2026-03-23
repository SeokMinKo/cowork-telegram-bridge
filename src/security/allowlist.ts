export interface SenderCheckContext {
  sender_id: number; allowed_sender_ids: number[];
  unknown_sender_policy: "silent_drop" | "reply_reject";
}

export function isAllowedSender(ctx: SenderCheckContext): boolean {
  if (ctx.allowed_sender_ids.length === 0) return false;
  return ctx.allowed_sender_ids.includes(ctx.sender_id);
}

export function filterAllowed<T extends { from_id: number | null }>(messages: T[], allowed_sender_ids: number[]): T[] {
  if (allowed_sender_ids.length === 0) return [];
  return messages.filter(m => m.from_id !== null && allowed_sender_ids.includes(m.from_id));
}
