"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Archive, Building2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, Button, Badge } from "@/components/ui";
import { formatRupiah } from "@/lib/format";
import type { Facility } from "@/lib/db/schema";
import type { FacilityType } from "@/lib/db/enums";
import { FACILITY_TYPES } from "@/lib/db/enums";
import { createFacilityAction, updateFacilityAction, archiveFacilityAction } from "./actions";
import { FacilityFormDialog, type FacilityFormValues } from "./FacilityFormDialog";

const TYPE_LABELS: Record<FacilityType, string> = {
  COWORKING_SEAT: "Coworking Seat",
  MEETING_ROOM: "Meeting Room",
  FULL_ROOM: "Full Room",
};

export function FacilitiesClient({ facilities: initialFacilities }: { facilities: Facility[] }) {
  const router = useRouter();
  const [facilities, setFacilities] = useState(initialFacilities);
  const [editing, setEditing] = useState<Facility | "new" | null>(null);
  const [archiving, setArchiving] = useState<Facility | null>(null);
  const [archivePending, setArchivePending] = useState(false);

  const grouped = FACILITY_TYPES.map((type) => ({
    type,
    items: facilities.filter((f) => f.type === type),
  })).filter((g) => g.items.length > 0);

  async function handleSave(values: FacilityFormValues) {
    if (editing === "new") {
      const created = await createFacilityAction(values);
      setFacilities((prev) => [...prev, created]);
    } else if (editing) {
      await updateFacilityAction(editing.id, values);
      setFacilities((prev) =>
        prev.map((f) => (f.id === editing.id ? { ...f, ...values } : f)),
      );
    }
    setEditing(null);
    router.refresh();
  }

  async function handleConfirmArchive() {
    if (!archiving) return;
    setArchivePending(true);
    try {
      await archiveFacilityAction(archiving.id);
      setFacilities((prev) => prev.filter((f) => f.id !== archiving.id));
      setArchiving(null);
      router.refresh();
    } finally {
      setArchivePending(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Building2 className="h-7 w-7 text-teal-600" aria-hidden="true" />
              Kelola Fasilitas
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Meeting room, coworking seat &amp; full room — tarif per jam, kapasitas &amp; ketersediaan.
            </p>
          </div>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tambah Fasilitas
          </Button>
        </div>
      </div>

      {facilities.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-gray-500">Belum ada fasilitas. Tambahkan fasilitas pertama Anda.</p>
        </Card>
      ) : (
        grouped.map(({ type, items }) => (
          <div key={type}>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              {TYPE_LABELS[type]} ({items.length})
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((facility) => (
                <Card key={facility.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900">{facility.name}</h3>
                    <Badge tone={facility.available ? "active" : "neutral"}>
                      {facility.available ? "Tersedia" : "Nonaktif"}
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-gray-500">
                    <p className="font-semibold text-gray-900">
                      {formatRupiah(facility.ratePerHourRupiah)}
                      <span className="font-normal text-gray-500"> /jam</span>
                    </p>
                    {facility.capacity != null && <p>Kapasitas: {facility.capacity} orang</p>}
                    {facility.seatLabel && <p>Label: {facility.seatLabel}</p>}
                    {facility.zone && <p>Zona: {facility.zone}</p>}
                    {facility.maxHoursCap != null && (
                      <p className="text-orange-700">Maks billing: {facility.maxHoursCap} jam</p>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(facility)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      <span aria-hidden="true">Edit</span>
                      <span className="sr-only">Edit {facility.name}</span>
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setArchiving(facility)}>
                      <Archive className="h-4 w-4" aria-hidden="true" />
                      <span aria-hidden="true">Arsipkan</span>
                      <span className="sr-only">Arsipkan {facility.name}</span>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {editing !== null && (
        <FacilityFormDialog
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {archiving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="archive-confirm-title"
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-md"
          >
            <h2 id="archive-confirm-title" className="text-lg font-semibold text-gray-900">
              Arsipkan fasilitas?
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              &quot;{archiving.name}&quot; tidak akan tampil lagi di katalog booking. Riwayat booking tetap tersimpan.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setArchiving(null)} disabled={archivePending}>
                Batal
              </Button>
              <Button variant="danger" onClick={handleConfirmArchive} disabled={archivePending}>
                {archivePending ? "Mengarsipkan…" : "Arsipkan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
