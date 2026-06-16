/**
 * Realtime seam integration test (Task 4.3, ADR-0013) — a REAL round-trip against
 * the local Supabase Realtime service (not a `typeof fn` smoke).
 *
 * Proves:
 * 1. `subscribeToOrgChannel` reaches the SUBSCRIBED state on the local stack.
 * 2. A broadcast event published on the same org channel is received by the
 *    subscriber's handler (real cross-client delivery).
 * 3. After unsubscribe, the subscriber stops receiving.
 *
 * This is a seam-level infrastructure proof, not a domain (KDS/cafe) test.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { subscribeToOrgChannel } from "@/lib/realtime/channel";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:64321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Realtime WebSocket handshake + delivery can take a couple of seconds locally.
const TIMEOUT = 20_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Publisher client on the same channel name as the subscriber util. */
const pub = createClient(SUPABASE_URL, ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

afterAll(async () => {
  await pub.removeAllChannels();
}, 15_000);

describe("Realtime seam — subscribeToOrgChannel", () => {
  it(
    "subscribes to an org channel and receives a real broadcast event",
    async () => {
      const received: Array<Record<string, unknown>> = [];
      const handler = (payload: unknown) =>
        received.push(payload as Record<string, unknown>);

      // Subscriber via the seam under test.
      const unsubscribe = subscribeToOrgChannel("rt-seam-org", "ping", handler);

      // Publisher must join the same channel name before it can broadcast.
      const pubChan = pub.channel("org:rt-seam-org");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("publisher never reached SUBSCRIBED")),
          10_000,
        );
        pubChan.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timer);
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timer);
            reject(new Error(`publisher subscribe failed: ${status}`));
          }
        });
      });

      // Re-send until the subscriber's handler fires (absorbs websocket timing
      // skew between the two clients). Each send MUST resolve (no error) — that
      // alone satisfies the broadcast-send contract even if delivery is slow.
      let lastSend: unknown = "ok";
      for (let i = 0; i < 20 && received.length === 0; i++) {
        lastSend = await pubChan.send({
          type: "broadcast",
          event: "ping",
          payload: { n: i },
        });
        await sleep(250);
      }

      expect(received.length).toBeGreaterThan(0);
      expect(received[0]).toMatchObject({ n: expect.any(Number) });
      // The broadcast send resolves without error.
      expect(lastSend).toBe("ok");

      // Unsubscribe stops further delivery: send once more, then assert nothing
      // new arrives within a short window.
      unsubscribe();
      const before = received.length;
      await pubChan.send({
        type: "broadcast",
        event: "ping",
        payload: { n: 999 },
      });
      await sleep(750);
      expect(received.length).toBe(before);
    },
    TIMEOUT,
  );
});
