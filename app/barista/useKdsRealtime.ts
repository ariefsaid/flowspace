"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Opens an org-scoped Supabase Realtime channel and calls `router.refresh()`
 * on any `cafe_orders` INSERT/UPDATE for the org.
 *
 * The `filter` is the primary cross-org guard; RLS is a defense-in-depth
 * backstop.  The orgId MUST originate from the server session (page.tsx),
 * never from a client value or URL param.
 *
 * [SEC] Channel name + postgres_changes filter are both scoped to orgId.
 */
export function useKdsRealtime(orgId: string) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`kds:${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cafe_orders", filter: `org_id=eq.${orgId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, router]);
}
