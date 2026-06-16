/**
 * Realtime seam — org-scoped broadcast channel (Task 4.3, ADR-0013).
 *
 * Scaffold only: no KDS / cafe domain — just the infrastructure seam.
 * The barista KDS and order-update dashboards will `import { subscribeToOrgChannel }`
 * from here once those surfaces are built.
 *
 * Uses the browser (anon-key) Supabase client: Realtime subscriptions run on
 * the client/browser side. Server-side subscription (if ever needed for SSE)
 * would use the admin client instead.
 */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";

/**
 * Subscribe to a broadcast event on the per-org Realtime channel.
 *
 * @param orgId  - The organisation's id (used as the channel name prefix).
 * @param event  - The broadcast event name to listen for.
 * @param handler - Called with the event payload each time the event fires.
 * @returns      An `unsubscribe` function that removes the subscription and
 *               disconnects the channel.
 */
export function subscribeToOrgChannel(
  orgId: string,
  event: string,
  handler: (payload: unknown) => void
): () => void {
  // Each call creates a short-lived client — safe for server-side scaffolding
  // where we don't want a persistent singleton; the browser SDK handles reconnects.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: {
      // Suppress noisy logs in test output.
      log_level: "info",
    },
  });

  const channel = supabase
    .channel(`org:${orgId}`)
    .on("broadcast", { event }, (msg) => handler(msg.payload))
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
