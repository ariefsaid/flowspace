import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatRupiah } from "@/lib/format";
import type { PrintJob } from "@/lib/types/views";

interface PrintHistoryProps {
  jobs: PrintJob[];
}

export function PrintHistory({ jobs }: PrintHistoryProps) {
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">
        Riwayat Print Terbaru
      </h2>

      {jobs.length === 0 ? (
        <p className="text-sm text-gray-400">Belum ada riwayat print.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              {/* Status badge */}
              <div className="mt-0.5 shrink-0">
                <Badge tone={job.status === "WAITING" ? "pending" : "completed"}>
                  {job.status === "WAITING" ? "Menunggu" : "Siap Ambil"}
                </Badge>
              </div>

              {/* File info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {job.filename}
                </p>
                <p className="text-xs text-gray-500">
                  {job.pages} hal&nbsp;•&nbsp;{formatRupiah(job.price)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
