/**
 * AC-KDS-RT: useKdsRealtime opens an org-scoped channel and calls router.refresh
 * on any cafe_orders INSERT/UPDATE — no cross-org filter leak.
 * Owning layer: unit (RTL + jsdom).
 */
import { describe, it, expect, vi, type Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKdsRealtime } from "./useKdsRealtime";

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// ---------------------------------------------------------------------------
// Build a fake Supabase channel spy chain
// ---------------------------------------------------------------------------
let capturedChannelName: string;
let capturedFilter: string | undefined;
let capturedCallback: (() => void) | undefined;
let mockRemoveChannel: Mock;
let mockSubscribe: Mock;
let mockOn: Mock;
let mockChannel: Mock;

function buildFakeClient() {
  mockRemoveChannel = vi.fn().mockResolvedValue("ok");
  mockSubscribe = vi.fn().mockReturnValue({ /* channel handle */ });
  mockOn = vi.fn().mockImplementation(
    (_event: string, opts: { filter?: string }, cb: () => void) => {
      capturedFilter = opts.filter;
      capturedCallback = cb;
      return { subscribe: mockSubscribe };
    },
  );
  mockChannel = vi.fn().mockImplementation((name: string) => {
    capturedChannelName = name;
    return { on: mockOn };
  });

  return {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  };
}

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: vi.fn(() => buildFakeClient()),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useKdsRealtime", () => {
  it(
    "subscribes to an org-scoped channel and refreshes on a cafe_orders change (no cross-org filter leak)",
    () => {
      const orgId = "org-abc-123";
      renderHook(() => useKdsRealtime(orgId));

      // (a) channel name is org-scoped
      expect(capturedChannelName).toBe(`kds:${orgId}`);

      // (b) postgres_changes filter is scoped to the org — cross-org-leak guard
      expect(capturedFilter).toBe(`org_id=eq.${orgId}`);

      // (c) the registered callback calls router.refresh
      expect(capturedCallback).toBeDefined();
      capturedCallback!();
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    },
  );

  it("cleans up the channel on unmount", () => {
    const orgId = "org-cleanup";
    const { unmount } = renderHook(() => useKdsRealtime(orgId));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });
});
