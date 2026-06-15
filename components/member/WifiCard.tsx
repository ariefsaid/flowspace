"use client";

import { useState } from "react";
import { Wifi, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { WifiInfo } from "@/lib/mock/types";

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
      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-slate-50 active:bg-slate-100"
      aria-label="Salin"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Disalin!" : "Salin"}
    </button>
  );
}

export function WifiCard({ wifi }: WifiCardProps) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-teal-600" />
        <h3 className="text-sm font-semibold text-gray-800">WiFi Access</h3>
      </div>

      <div className="space-y-3">
        {/* SSID */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
          <div>
            <p className="text-xs text-gray-500">Nama Jaringan (SSID)</p>
            <p className="mt-0.5 font-medium text-gray-900">{wifi.ssid}</p>
          </div>
          <CopyButton text={wifi.ssid} />
        </div>

        {/* Voucher */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
          <div>
            <p className="text-xs text-gray-500">Kode Voucher</p>
            <p className="mt-0.5 font-mono font-semibold tracking-widest text-gray-900">
              {wifi.voucher}
            </p>
          </div>
          <CopyButton text={wifi.voucher} />
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Hubungkan ke WiFi &quot;{wifi.ssid}&quot; lalu masukkan kode voucher di halaman login.
      </p>
    </Card>
  );
}
