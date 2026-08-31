/**
 * FacilitiesClient (I-042) — the facility catalog editor. Covers: empty
 * state, grouped list render (Rupiah-formatted rate), add/edit dialog
 * save (success + inline field error from the repo's INVALID_* rejection),
 * and the archive (soft-archive, "Arsipkan") confirm flow. Each `it()`
 * title names its own owning behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FacilitiesClient } from "./FacilitiesClient";
import {
  createFacilityAction,
  updateFacilityAction,
  archiveFacilityAction,
} from "./actions";
import type { Facility } from "@/lib/db/schema";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  createFacilityAction: vi.fn(),
  updateFacilityAction: vi.fn(),
  archiveFacilityAction: vi.fn(),
}));

function makeFacility(overrides: Partial<Facility> = {}): Facility {
  return {
    id: "f1",
    orgId: "o1",
    name: "Meeting Room A",
    type: "MEETING_ROOM",
    ratePerHourRupiah: 50000,
    available: true,
    capacity: 6,
    seatLabel: null,
    zone: null,
    maxHoursCap: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as Facility;
}

describe("FacilitiesClient", () => {
  beforeEach(() => {
    vi.mocked(createFacilityAction).mockReset();
    vi.mocked(updateFacilityAction).mockReset();
    vi.mocked(archiveFacilityAction).mockReset();
  });

  it("renders the empty state and a Tambah button when there are no facilities", () => {
    render(<FacilitiesClient facilities={[]} />);
    expect(screen.getByText(/belum ada fasilitas/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tambah fasilitas/i })).toBeInTheDocument();
  });

  it("renders facilities grouped by type with the Rupiah-formatted rate", () => {
    render(
      <FacilitiesClient
        facilities={[
          makeFacility({ id: "f1", name: "Meeting Room A", type: "MEETING_ROOM", ratePerHourRupiah: 50000 }),
          makeFacility({ id: "f2", name: "Desk 1", type: "COWORKING_SEAT", ratePerHourRupiah: 15000, capacity: 1, seatLabel: "A1", zone: "DESK" }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: /meeting room/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /coworking seat/i })).toBeInTheDocument();
    expect(screen.getByText("Meeting Room A")).toBeInTheDocument();
    expect(screen.getByText("Rp 50.000")).toBeInTheDocument();
    expect(screen.getByText("Desk 1")).toBeInTheDocument();
    expect(screen.getByText("Rp 15.000")).toBeInTheDocument();
  });

  it("adds a facility: opens the dialog, submits, and forwards the entered fields on Save", async () => {
    vi.mocked(createFacilityAction).mockResolvedValueOnce(makeFacility());
    render(<FacilitiesClient facilities={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /tambah fasilitas/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/nama fasilitas/i), { target: { value: "Desk 9" } });
    fireEvent.change(within(dialog).getByLabelText(/tarif per jam/i), { target: { value: "20000" } });
    fireEvent.change(within(dialog).getByLabelText(/kapasitas/i), { target: { value: "2" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(createFacilityAction).toHaveBeenCalledTimes(1));
    expect(createFacilityAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Desk 9", ratePerHourRupiah: 20000, capacity: 2 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows an inline field error for the rate input and keeps the dialog open when the repo rejects INVALID_RATE", async () => {
    vi.mocked(createFacilityAction).mockRejectedValueOnce(new Error("INVALID_RATE"));
    render(<FacilitiesClient facilities={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /tambah fasilitas/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/nama fasilitas/i), { target: { value: "Desk 9" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^simpan$/i }));

    await waitFor(() =>
      expect(within(dialog).getByText(/tarif per jam harus angka bulat/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("edits a facility: opens the dialog prefilled and forwards the id + edited fields on Save", async () => {
    vi.mocked(updateFacilityAction).mockResolvedValueOnce(undefined);
    render(<FacilitiesClient facilities={[makeFacility({ id: "f7", name: "Meeting Room A" })]} />);

    fireEvent.click(screen.getByRole("button", { name: /edit meeting room a/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/nama fasilitas/i)).toHaveValue("Meeting Room A");

    fireEvent.change(within(dialog).getByLabelText(/nama fasilitas/i), { target: { value: "Meeting Room A2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(updateFacilityAction).toHaveBeenCalledTimes(1));
    expect(updateFacilityAction).toHaveBeenCalledWith(
      "f7",
      expect.objectContaining({ name: "Meeting Room A2" }),
    );
  });

  it("archives a facility only after the confirm dialog is accepted", async () => {
    vi.mocked(archiveFacilityAction).mockResolvedValueOnce(undefined);
    render(<FacilitiesClient facilities={[makeFacility({ id: "f9", name: "Meeting Room A" })]} />);

    fireEvent.click(screen.getByRole("button", { name: /arsipkan meeting room a/i }));
    const confirm = screen.getByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: /batal/i }));
    expect(archiveFacilityAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /arsipkan meeting room a/i }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /^arsipkan$/i }));

    await waitFor(() => expect(archiveFacilityAction).toHaveBeenCalledWith("f9"));
  });
});
