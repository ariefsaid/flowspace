/**
 * Unit tests for lib/db/users.ts money/pool-sensitive call contracts.
 * The org_id-scoping / lookup-behavior contract itself is owned by
 * lib/db/users.int.test.ts (real DB). This file owns the pool-deadlock fix
 * proof (I-044 fix round 2, item 3) — a fast, deterministic mock, mirroring
 * lib/db/tier-config.ts's own `getTierDiscounts` fix (I-040).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db } from "@/lib/db/drizzle";

const select = vi.fn();
// The global `db` mock has NO `select` method — if `findProfilesByIds` ever
// fell through to it instead of the passed `dbLike`, the call would throw
// "db.select is not a function", not resolve.
vi.mock("@/lib/db/drizzle", () => ({
  db: {},
}));

import { findProfilesByIds } from "@/lib/db/users";

describe("findProfilesByIds — pool-deadlock fix (I-044 fix round 2, item 3)", () => {
  beforeEach(() => select.mockReset());

  it("[SEC][POOL] uses the caller's dbLike, never the global db, when one is given — so an in-tx caller never checks out a SECOND pool connection", async () => {
    const rows = [
      { id: "u1", name: "Alice", email: "alice@x.test", membershipTier: "GOLD" as const },
    ];
    select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve(rows) }),
    });
    const txWithSelect = { select } as unknown as Pick<typeof db, "select">;

    const result = await findProfilesByIds("o1", ["u1"], txWithSelect);

    expect(select).toHaveBeenCalledTimes(1);
    expect(result).toEqual(rows);
  });

  it("returns [] for an empty ids array without touching dbLike at all (existing contract preserved)", async () => {
    const txWithSelect = { select } as unknown as Pick<typeof db, "select">;
    const result = await findProfilesByIds("o1", [], txWithSelect);
    expect(result).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});
