import { describe, test, expect } from "bun:test";
import { MessageTracker } from "../../src/http/message_tracker";

describe("MessageTracker", () => {
  test("enqueueEdit executes edits serially", async () => {
    const tracker = new MessageTracker();
    const order: number[] = [];

    await Promise.all([
      tracker.enqueueEdit("sess-1", async () => {
        await Bun.sleep(30);
        order.push(1);
      }),
      tracker.enqueueEdit("sess-1", async () => {
        await Bun.sleep(10);
        order.push(2);
      }),
      tracker.enqueueEdit("sess-1", async () => {
        order.push(3);
      }),
    ]);

    // All three should execute in order despite different durations
    expect(order).toEqual([1, 2, 3]);
  });

  test("different sessions run in parallel", async () => {
    const tracker = new MessageTracker();
    const order: string[] = [];

    await Promise.all([
      tracker.enqueueEdit("sess-a", async () => {
        await Bun.sleep(30);
        order.push("a");
      }),
      tracker.enqueueEdit("sess-b", async () => {
        order.push("b");
      }),
    ]);

    // sess-b should complete before sess-a since they're parallel
    expect(order[0]).toBe("b");
    expect(order[1]).toBe("a");
  });

  test("errors don't block subsequent edits", async () => {
    const tracker = new MessageTracker();
    const results: string[] = [];

    await tracker.enqueueEdit("sess-err", async () => {
      throw new Error("boom");
    });
    await tracker.enqueueEdit("sess-err", async () => {
      results.push("ok");
    });

    expect(results).toEqual(["ok"]);
  });

  test("debounce skips rapid calls and only runs last", async () => {
    const tracker = new MessageTracker();
    const results: number[] = [];

    // Fire 5 rapid debounced edits; only the last should execute
    for (let i = 1; i <= 5; i++) {
      tracker.debouncedEdit("sess-d", 50, async () => {
        results.push(i);
      });
    }

    // Wait for debounce to settle
    await Bun.sleep(120);
    expect(results).toEqual([5]);
  });

  test("getToolLog tracks tool entries per session", () => {
    const tracker = new MessageTracker();
    tracker.addToolLog("sess-t", "📖 index.ts");
    tracker.addToolLog("sess-t", "💻 bun test");
    expect(tracker.getToolLog("sess-t")).toEqual(["📖 index.ts", "💻 bun test"]);
  });

  test("getToolLog returns empty for unknown session", () => {
    const tracker = new MessageTracker();
    expect(tracker.getToolLog("unknown")).toEqual([]);
  });

  test("clearSession cleans up all data", () => {
    const tracker = new MessageTracker();
    tracker.addToolLog("sess-c", "item");
    tracker.clearSession("sess-c");
    expect(tracker.getToolLog("sess-c")).toEqual([]);
  });
});
