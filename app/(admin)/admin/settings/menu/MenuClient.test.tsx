/**
 * MenuClient (I-042) renders the cafe menu grouped by category, an
 * add/edit form covering every field (name/emoji/category/price/description/
 * available), an inline archive confirm, and surfaces the money-adjacent
 * INVALID_PRICE rejection without a false success state. Empty, add, edit,
 * toggle, archive and error paths are exercised against real rendered
 * behavior (mocked actions only) — each `it()` title names its owning
 * acceptance criterion.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MenuClient } from "./MenuClient";
import {
  createMenuItemAction,
  updateMenuItemAction,
  toggleAvailableAction,
  archiveMenuItemAction,
} from "./actions";
import type { CafeMenuItem } from "@/lib/db/schema";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  createMenuItemAction: vi.fn(),
  updateMenuItemAction: vi.fn(),
  toggleAvailableAction: vi.fn(),
  archiveMenuItemAction: vi.fn(),
}));

function makeItem(overrides: Partial<CafeMenuItem> = {}): CafeMenuItem {
  return {
    id: "m1",
    orgId: "o1",
    name: "Kopi Susu",
    emoji: "☕",
    category: "COFFEE",
    priceRupiah: 18_000,
    description: "Signature milk coffee",
    hasVariants: false,
    variantConfig: null,
    available: true,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CafeMenuItem;
}

describe("MenuClient", () => {
  beforeEach(() => {
    vi.mocked(createMenuItemAction).mockReset();
    vi.mocked(updateMenuItemAction).mockReset();
    vi.mocked(toggleAvailableAction).mockReset();
    vi.mocked(archiveMenuItemAction).mockReset();
  });

  it("AC-M20: empty state renders a message and no category groups when there are no items", () => {
    render(<MenuClient items={[]} />);
    expect(screen.getByText(/belum ada menu/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /coffee/i })).not.toBeInTheDocument();
  });

  it("AC-M21: renders items grouped by category with name, price and available checkbox", () => {
    render(
      <MenuClient
        items={[
          makeItem({ id: "m1", name: "Kopi Susu", category: "COFFEE", priceRupiah: 18_000 }),
          makeItem({ id: "m2", name: "Nasi Goreng", category: "FOOD", priceRupiah: 25_000, emoji: "🍚" }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: /coffee/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^food/i })).toBeInTheDocument();
    expect(screen.getByText("Kopi Susu")).toBeInTheDocument();
    expect(screen.getByText("Rp 18.000")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /tersedia — kopi susu/i })).toBeChecked();
  });

  it("AC-M22: opening 'Tambah Menu' shows a blank form with all fields, and Save creates the item", async () => {
    vi.mocked(createMenuItemAction).mockResolvedValue(
      makeItem({ id: "new1", name: "Americano", category: "COFFEE", priceRupiah: 15_000 }),
    );
    render(<MenuClient items={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /tambah menu/i }));

    fireEvent.change(screen.getByLabelText(/nama menu/i), { target: { value: "Americano" } });
    fireEvent.change(screen.getByLabelText(/^harga/i), { target: { value: "15000" } });
    fireEvent.change(screen.getByLabelText(/deskripsi/i), { target: { value: "Black coffee" } });
    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(createMenuItemAction).toHaveBeenCalledTimes(1));
    expect(createMenuItemAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Americano", priceRupiah: 15_000, description: "Black coffee" }),
    );
    // form closes and the new item appears
    await waitFor(() => expect(screen.getByText("Americano")).toBeInTheDocument());
  });

  it("AC-M23: an invalid-price rejection on create surfaces an inline alert, no item added", async () => {
    vi.mocked(createMenuItemAction).mockRejectedValueOnce(new Error("INVALID_PRICE"));
    render(<MenuClient items={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /tambah menu/i }));
    fireEvent.change(screen.getByLabelText(/nama menu/i), { target: { value: "Bad Item" } });
    fireEvent.change(screen.getByLabelText(/^harga/i), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/harga/i));
    expect(screen.queryByText("Bad Item")).not.toBeInTheDocument();
  });

  it("AC-M24: clicking Edit pre-fills the form, and Save patches the item in place", async () => {
    vi.mocked(updateMenuItemAction).mockResolvedValue(undefined);
    render(<MenuClient items={[makeItem({ id: "m1", name: "Kopi Susu", priceRupiah: 18_000 })]} />);

    fireEvent.click(screen.getByRole("button", { name: /edit kopi susu/i }));
    expect(screen.getByLabelText(/nama menu/i)).toHaveValue("Kopi Susu");

    fireEvent.change(screen.getByLabelText(/nama menu/i), { target: { value: "Kopi Susu Gula Aren" } });
    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(updateMenuItemAction).toHaveBeenCalledTimes(1));
    expect(updateMenuItemAction).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ name: "Kopi Susu Gula Aren" }),
    );
    await waitFor(() => expect(screen.getByText("Kopi Susu Gula Aren")).toBeInTheDocument());
  });

  it("AC-M25: toggling the available checkbox calls the action and flips state optimistically", async () => {
    vi.mocked(toggleAvailableAction).mockResolvedValue(undefined);
    render(<MenuClient items={[makeItem({ id: "m1", name: "Kopi Susu", available: true })]} />);

    const checkbox = screen.getByRole("checkbox", { name: /tersedia — kopi susu/i });
    fireEvent.click(checkbox);

    await waitFor(() => expect(toggleAvailableAction).toHaveBeenCalledWith("m1", false));
    expect(checkbox).not.toBeChecked();
  });

  it("AC-M26: Arsipkan requires a confirm step, then removes the item from the list", async () => {
    vi.mocked(archiveMenuItemAction).mockResolvedValue(undefined);
    render(<MenuClient items={[makeItem({ id: "m1", name: "Kopi Susu" })]} />);

    fireEvent.click(screen.getByRole("button", { name: /arsipkan kopi susu/i }));
    // not archived yet — needs confirmation
    expect(archiveMenuItemAction).not.toHaveBeenCalled();
    expect(screen.getByText("Kopi Susu")).toBeInTheDocument();

    const confirmRegion = screen.getByText(/yakin/i).closest("div") as HTMLElement;
    fireEvent.click(within(confirmRegion).getByRole("button", { name: /arsipkan/i }));

    await waitFor(() => expect(archiveMenuItemAction).toHaveBeenCalledWith("m1"));
    await waitFor(() => expect(screen.queryByText("Kopi Susu")).not.toBeInTheDocument());
  });

  it("AC-M27: filtering by category shows only that category's items", () => {
    render(
      <MenuClient
        items={[
          makeItem({ id: "m1", name: "Kopi Susu", category: "COFFEE" }),
          makeItem({ id: "m2", name: "Nasi Goreng", category: "FOOD", emoji: "🍚" }),
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/filter kategori/i), { target: { value: "FOOD" } });
    expect(screen.queryByText("Kopi Susu")).not.toBeInTheDocument();
    expect(screen.getByText("Nasi Goreng")).toBeInTheDocument();
  });
});
