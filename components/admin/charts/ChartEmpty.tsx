import { Inbox } from "lucide-react";

/** Shared empty state for a chart with no data in the selected period (I-048). */
export function ChartEmpty({ message = "Belum ada data untuk periode ini." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50">
        <Inbox className="h-5 w-5 text-teal-400" aria-hidden="true" />
      </div>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

export default ChartEmpty;
