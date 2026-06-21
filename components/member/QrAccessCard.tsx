"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Key } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { TOKEN_WINDOW_MS } from "@/lib/keycard/token";

const REFRESH_SECONDS = TOKEN_WINDOW_MS / 1000; // 30

interface QrAccessCardProps {
  /**
   * Server-signed, window-rotating token rendered as the QR value. The client
   * only triggers rotation via `router.refresh()` — it NEVER signs the token.
   * [SEC] (mirrors /keycard: lib/keycard/token is the single signer).
   */
  token: string;
}

export function QrAccessCard({ token }: QrAccessCardProps) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(() =>
    REFRESH_SECONDS - Math.floor((Date.now() / 1000) % REFRESH_SECONDS),
  );

  // Per-second countdown drives the "Refreshes in Xs" display (cosmetic only).
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft(
        REFRESH_SECONDS - Math.floor((Date.now() / 1000) % REFRESH_SECONDS),
      );
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Re-fetch the RSC at each 30s window boundary so the server re-signs a fresh
  // token for the new window. The token stays server-derived at all times.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const msToNext = TOKEN_WINDOW_MS - (Date.now() % TOKEN_WINDOW_MS);
    const timeout = setTimeout(() => {
      router.refresh();
      interval = setInterval(() => router.refresh(), TOKEN_WINDOW_MS);
    }, msToNext);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        <Key className="h-4 w-4 text-teal-600" /> QR Akses Pintu &amp; Print
      </h3>
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <QRCodeSVG value={token} size={148} level="M" fgColor="#14b8a6" bgColor="#ffffff" />
      </div>
      <p className="text-xs text-gray-500">
        Refreshes in{" "}
        <span className="font-semibold text-teal-600 tabular-nums">
          {secondsLeft}s
        </span>
      </p>
      <p className="text-center text-xs text-gray-400">
        Scan untuk akses pintu &amp; mesin print/fotocopy
      </p>
    </div>
  );
}
