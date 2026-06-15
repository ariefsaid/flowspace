"use client";

import { useEffect, useState } from "react";
import { Key } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const REFRESH_SECONDS = 30;

/** Generates a time-bucketed token so the QR changes every REFRESH_SECONDS. */
function generateQrToken(memberId: string) {
  const bucket = Math.floor(Date.now() / (REFRESH_SECONDS * 1000));
  return `flowspace:access:${memberId}:${bucket}`;
}

interface QrAccessCardProps {
  memberId: string;
}

export function QrAccessCard({ memberId }: QrAccessCardProps) {
  const [token, setToken] = useState(() => generateQrToken(memberId));
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const ms = Date.now();
    return REFRESH_SECONDS - Math.floor((ms / 1000) % REFRESH_SECONDS);
  });

  useEffect(() => {
    const id = setInterval(() => {
      const ms = Date.now();
      const remaining = REFRESH_SECONDS - Math.floor((ms / 1000) % REFRESH_SECONDS);
      setSecondsLeft(remaining);
      setToken(generateQrToken(memberId));
    }, 1000);
    return () => clearInterval(id);
  }, [memberId]);

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
