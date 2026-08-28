/**
 * Printer CRUD page regression tests (I-043, spec 0009).
 *
 * The admin printers surface renders an accessible labelled form for every
 * printer field (CUPS name, display name, location, type, color support,
 * paper-size checkboxes, active/default flags, sort order), create/edit/
 * archive/default controls, an empty state, and saving/error feedback.
 * ('s role gate is owned by the action + integration boundary tests.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createPrinterAction = vi.fn();
const updatePrinterAction = vi.fn();
const archivePrinterAction = vi.fn();
const setDefaultPrinterAction = vi.fn();

vi.mock("./actions", () => ({
  createPrinterAction: (...a: unknown[]) => createPrinterAction(...a),
  updatePrinterAction: (...a: unknown[]) => updatePrinterAction(...a),
  archivePrinterAction: (...a: unknown[]) => archivePrinterAction(...a),
  setDefaultPrinterAction: (...a: unknown[]) => setDefaultPrinterAction(...a),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { PrintersClient, type PrinterRow } from "./PrintersClient";

const printers: PrinterRow[] = [
  {
    id: "p1",
    name: "HP_LaserJet",
    displayName: "LaserJet Lobi",
    location: "Lobby",
    printerType: "LASER",
    colorSupport: false,
    paperSizes: ["A4", "F4"],
    isActive: true,
    isDefault: true,
    sortOrder: 1,
    archivedAt: null,
  },
  {
    id: "p2",
    name: "Epson_Color",
    displayName: "Epson Warna",
    location: null,
    printerType: "INKJET",
    colorSupport: true,
    paperSizes: ["A4", "A3"],
    isActive: true,
    isDefault: false,
    sortOrder: 2,
    archivedAt: null,
  },
];

function fieldLabels() {
  return {
    cups: screen.getByLabelText(/nama cups/i),
    display: screen.getByLabelText(/nama tampilan/i),
    location: screen.getByLabelText(/lokasi/i),
    type: screen.getByLabelText(/tipe printer/i),
    color: screen.getByLabelText(/dukungan warna/i),
    a4: screen.getByLabelText(/^A4$/),
    a3: screen.getByLabelText(/^A3$/),
    f4: screen.getByLabelText(/^F4$/),
    active: screen.getByLabelText(/aktif/i),
    isDefault: screen.getByLabelText(/printer default/i),
    sort: screen.getByLabelText(/urutan/i),
  };
}

describe("PrintersClient", () => {
  beforeEach(() => {
    createPrinterAction.mockReset();
    updatePrinterAction.mockReset();
    archivePrinterAction.mockReset();
    setDefaultPrinterAction.mockReset();
  });

  it("renders the empty state when the org has no printers", () => {
    render(<PrintersClient printers={[]} />);
    expect(screen.getByText(/belum ada printer/i)).toBeVisible();
    // The create form is still available.
    expect(screen.getByLabelText(/nama cups/i)).toBeVisible();
  });

  it("renders a labelled form with every printer field", () => {
    render(<PrintersClient printers={printers} />);
    const f = fieldLabels();
    expect(f.cups).toBeVisible();
    expect(f.display).toBeVisible();
    expect(f.location).toBeVisible();
    expect(f.type).toBeVisible();
    expect(f.color).toBeVisible();
    expect(f.a4).toBeVisible();
    expect(f.a3).toBeVisible();
    expect(f.f4).toBeVisible();
    expect(f.active).toBeVisible();
    expect(f.isDefault).toBeVisible();
    expect(f.sort).toBeVisible();
    // Existing printers listed with their display names.
    expect(screen.getByText("LaserJet Lobi")).toBeVisible();
    expect(screen.getByText("Epson Warna")).toBeVisible();
  });

  it("creates a printer from the form values", async () => {
    createPrinterAction.mockResolvedValue(undefined);
    render(<PrintersClient printers={[]} />);

    const f = fieldLabels();
    fireEvent.change(f.cups, { target: { value: "Canon_New" } });
    fireEvent.change(f.display, { target: { value: "Canon Baru" } });
    fireEvent.click(f.color);
    fireEvent.click(f.a3);
    fireEvent.click(screen.getByRole("button", { name: /tambah printer/i }));

    await waitFor(() =>
      expect(createPrinterAction).toHaveBeenCalledWith({
        name: "Canon_New",
        displayName: "Canon Baru",
        location: "",
        printerType: "LASER",
        colorSupport: true,
        paperSizes: ["A4", "A3"],
        sortOrder: 0,
      }),
    );
  });

  it("edits an existing printer (form pre-filled, update called with id)", async () => {
    updatePrinterAction.mockResolvedValue(undefined);
    render(<PrintersClient printers={printers} />);

    fireEvent.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    const f = fieldLabels();
    expect(f.cups).toHaveValue("HP_LaserJet");
    expect(f.display).toHaveValue("LaserJet Lobi");
    expect(f.color).not.toBeChecked();
    expect(f.a4).toBeChecked();
    expect(f.f4).toBeChecked();

    fireEvent.change(f.display, { target: { value: "LaserJet Utama" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    await waitFor(() =>
      expect(updatePrinterAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p1", displayName: "LaserJet Utama" }),
      ),
    );
  });

  it("archives a printer and sets a default via the row controls", async () => {
    archivePrinterAction.mockResolvedValue(undefined);
    setDefaultPrinterAction.mockResolvedValue(undefined);
    render(<PrintersClient printers={printers} />);

    fireEvent.click(screen.getAllByRole("button", { name: /arsipkan/i })[1]);
    await waitFor(() => expect(archivePrinterAction).toHaveBeenCalledWith("p2"));

    fireEvent.click(screen.getAllByRole("button", { name: /jadikan default/i })[0]);
    await waitFor(() => expect(setDefaultPrinterAction).toHaveBeenCalledWith("p2"));
  });

  it("shows an error message and recovers when an action rejects", async () => {
    createPrinterAction.mockRejectedValueOnce(new Error("PRINTER_NAME_EXISTS"));
    render(<PrintersClient printers={[]} />);

    const f = fieldLabels();
    fireEvent.change(f.cups, { target: { value: "HP_LaserJet" } });
    fireEvent.change(f.display, { target: { value: "Dup" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah printer/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/sudah dipakai/i);
    // Recovery: a retry succeeds and the alert clears.
    createPrinterAction.mockResolvedValueOnce(undefined);
    fireEvent.change(f.cups, { target: { value: "HP_New" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah printer/i }));
    await waitFor(() => expect(createPrinterAction).toHaveBeenCalledTimes(2));
  });

  it("disables the submit button while saving", async () => {
    let resolveFn: () => void = () => {};
    createPrinterAction.mockImplementation(
      () => new Promise<void>((r) => (resolveFn = r)),
    );
    render(<PrintersClient printers={[]} />);

    const f = fieldLabels();
    fireEvent.change(f.cups, { target: { value: "X" } });
    fireEvent.change(f.display, { target: { value: "X" } });
    const submit = screen.getByRole("button", { name: /tambah printer/i });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(createPrinterAction).toHaveBeenCalledTimes(1);
    resolveFn();
    await waitFor(() => expect(submit).not.toBeDisabled());
  });
});
