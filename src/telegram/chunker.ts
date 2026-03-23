export const TELEGRAM_MAX_LENGTH = 4096;

export function chunkText(text: string, maxLen: number = TELEGRAM_MAX_LENGTH): string[] {
  if (!text) return [];
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    const slice = remaining.slice(0, maxLen);
    const lastNewline = slice.lastIndexOf("\n");
    const cutAt = lastNewline > 0 ? lastNewline + 1 : maxLen;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
