import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatRupiah } from "@/lib/format";

export type MemberPrintStatus = "PENDING" | "PROCESSING" | "READY" | "COMPLETED" | "FAILED" | "WAITING";
export interface PrintHistoryJob {
  id: string;
  filename: string;
  pages: number;
  totalPages?: number | null;
  price: number;
  status: MemberPrintStatus;
  datetime: string;
  printerName?: string | null;
}

const STATUS: Record<MemberPrintStatus, { label: string; tone: "pending" | "active" | "completed" | "cancelled" }> = {
  PENDING: { label: "Menunggu", tone: "pending" },
  WAITING: { label: "Menunggu", tone: "pending" },
  PROCESSING: { label: "Diproses", tone: "active" },
  READY: { label: "Siap Ambil", tone: "active" },
  COMPLETED: { label: "Selesai", tone: "completed" },
  FAILED: { label: "Gagal", tone: "cancelled" },
};

export function PrintHistory({ jobs }: { jobs: PrintHistoryJob[] }) {
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">Riwayat Print Terbaru</h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-gray-400">Belum ada riwayat print.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {jobs.map((job) => {
            const status = STATUS[job.status];
            return (
              <li key={job.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="mt-0.5 shrink-0"><Badge tone={status.tone}>{status.label}</Badge></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{job.filename}</p>
                  <p className="text-xs text-gray-500">
                    {job.totalPages ?? job.pages} lembar&nbsp;•&nbsp;{formatRupiah(job.price)}
                    {job.printerName ? <> &nbsp;•&nbsp; {job.printerName}</> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
