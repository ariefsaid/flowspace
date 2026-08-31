"use client";

import { useState } from "react";
import { Wifi, Copy, Check } from "lucide-react";
import type { WifiInfo } from "@/lib/types/views";

interface WifiCardProps {
  wifi: WifiInfo;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silent fail
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-slate-100 active:bg-slate-200"
      aria-label="Salin"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function WifiCard({ wifi }: WifiCardProps) {
  // Simulated seam (UniFi integration deferred): voucher starts hidden and is
  // revealed on request, matching the original's null-until-requested flow.
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-800">WiFi Access</h3>
      </div>

      <div className="space-y-3">
        {/* SSID */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div>
            <p className="text-xs text-gray-600">Nama WiFi (SSID)</p>
            <p className="mt-0.5 font-medium text-gray-900">{wifi.ssid}</p>
          </div>
          <CopyButton text={wifi.ssid} />
        </div>

        {/* Voucher */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div>
            <p className="text-xs text-gray-600">Kode Voucher</p>
            {revealed ? (
              <p className="mt-0.5 font-mono font-semibold tracking-widest text-blue-600">
                {wifi.voucher}
              </p>
            ) : (
              <p className="mt-0.5 text-sm italic text-gray-600">Voucher belum tersedia</p>
            )}
          </div>
          {revealed ? (
            <CopyButton text={wifi.voucher} />
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            >
              Get Voucher
            </button>
          )}
        </div>
      </div>

      {revealed ? (
        <p className="mt-3 text-xs text-gray-600">
          💡 Hubungkan ke WiFi &quot;{wifi.ssid}&quot;, lalu masukkan kode voucher
          di halaman login.
        </p>
      ) : (
        <p className="mt-3 text-xs text-amber-700">
          ⚠️ Klik &quot;Get Voucher&quot; untuk mendapatkan kode akses WiFi.
        </p>
      )}
    </div>
  );
}
