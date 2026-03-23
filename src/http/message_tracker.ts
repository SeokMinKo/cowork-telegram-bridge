export class MessageTracker {
  private queues: Map<string, Promise<void>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private toolLogs: Map<string, string[]> = new Map();

  /**
   * Enqueue an edit for a session. Edits for the same session run serially;
   * different sessions run in parallel.
   */
  async enqueueEdit(sessionId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.queues.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn).catch(() => {});
    this.queues.set(sessionId, next);
    return next;
  }

  /**
   * Debounced edit: within `delayMs`, only the last call executes.
   * Useful for rapid PostToolUse events.
   */
  debouncedEdit(sessionId: string, delayMs: number, fn: () => Promise<void>): void {
    const existing = this.debounceTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(sessionId);
      this.enqueueEdit(sessionId, fn);
    }, delayMs);

    this.debounceTimers.set(sessionId, timer);
  }

  addToolLog(sessionId: string, entry: string): void {
    const logs = this.toolLogs.get(sessionId) ?? [];
    logs.push(entry);
    this.toolLogs.set(sessionId, logs);
  }

  getToolLog(sessionId: string): string[] {
    return this.toolLogs.get(sessionId) ?? [];
  }

  clearSession(sessionId: string): void {
    this.queues.delete(sessionId);
    this.toolLogs.delete(sessionId);
    const timer = this.debounceTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.debounceTimers.delete(sessionId);
  }
}
