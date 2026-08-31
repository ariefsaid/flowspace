/**
 * The site-settings editor renders venue/SEO/social fields populated from
 * seeded values (empty state = blank fields), shows the brand/env note, saves
 * on submit, and surfaces a save error without a false "saved" state (each
 * `it()` title names its own owning acceptance criterion).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SiteClient } from "./SiteClient";
import { saveSiteSettingsAction, type SiteSettingsInput } from "./actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ saveSiteSettingsAction: vi.fn() }));

const seeded: SiteSettingsInput = {
  name: "FlowSpace",
  tagline: "Coworking & Cafe",
  address: "Jl. Contoh No. 1",
  phone: "021-1234567",
  openingHours: "Senin - Jumat: 08:00 - 22:00",
  seoTitle: "FlowSpace — Coworking & Cafe",
  seoDescription: "Ruang kerja bersama dan cafe.",
  socialInstagram: "https://instagram.com/flowspace",
  socialFacebook: "https://facebook.com/flowspace",
  socialWhatsapp: "https://wa.me/628123456789",
};

const empty: SiteSettingsInput = {
  name: "",
  tagline: "",
  address: "",
  phone: "",
  openingHours: "",
  seoTitle: "",
  seoDescription: "",
  socialInstagram: "",
  socialFacebook: "",
  socialWhatsapp: "",
};

describe("SiteClient", () => {
  beforeEach(() => {
    vi.mocked(saveSiteSettingsAction).mockReset();
  });

  it("AC: renders venue/SEO/social fields populated from seeded values, plus the brand-note and Simpan button", () => {
    render(<SiteClient initial={seeded} />);
    expect(screen.getByLabelText("Nama Venue")).toHaveValue("FlowSpace");
    expect(screen.getByLabelText("Tagline")).toHaveValue("Coworking & Cafe");
    expect(screen.getByLabelText("Alamat")).toHaveValue("Jl. Contoh No. 1");
    expect(screen.getByLabelText("Telepon")).toHaveValue("021-1234567");
    expect(screen.getByLabelText("Jam Operasional")).toHaveValue("Senin - Jumat: 08:00 - 22:00");
    expect(screen.getByLabelText("Meta Title")).toHaveValue("FlowSpace — Coworking & Cafe");
    expect(screen.getByLabelText("Meta Description")).toHaveValue("Ruang kerja bersama dan cafe.");
    expect(screen.getByLabelText("Instagram")).toHaveValue("https://instagram.com/flowspace");
    expect(screen.getByLabelText("Facebook")).toHaveValue("https://facebook.com/flowspace");
    expect(screen.getByLabelText("WhatsApp")).toHaveValue("https://wa.me/628123456789");
    expect(screen.getByText(/membaca konfigurasi brand dari environment/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Simpan/i })).toBeInTheDocument();
  });

  it("AC: empty state — no settings row yet renders every field blank, no crash", () => {
    render(<SiteClient initial={empty} />);
    expect(screen.getByLabelText("Nama Venue")).toHaveValue("");
    expect(screen.getByLabelText("WhatsApp")).toHaveValue("");
  });

  it("AC: editing fields and saving forwards the edited payload", async () => {
    vi.mocked(saveSiteSettingsAction).mockResolvedValueOnce(undefined);
    render(<SiteClient initial={empty} />);
    fireEvent.change(screen.getByLabelText("Nama Venue"), { target: { value: "FlowSpace Hub" } });
    fireEvent.change(screen.getByLabelText("Instagram"), {
      target: { value: "https://instagram.com/flowspacehub" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(saveSiteSettingsAction).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(saveSiteSettingsAction).mock.calls[0][0];
    expect(payload.name).toBe("FlowSpace Hub");
    expect(payload.socialInstagram).toBe("https://instagram.com/flowspacehub");
    await screen.findByText("Tersimpan");
  });

  it("AC: shows an error alert and no saved indicator when the save action rejects", async () => {
    vi.mocked(saveSiteSettingsAction).mockRejectedValueOnce(new Error("INVALID_LENGTH:address"));
    render(<SiteClient initial={seeded} />);
    fireEvent.click(screen.getByRole("button", { name: /Simpan/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/maksimal 500 karakter/);
    expect(screen.queryByText("Tersimpan")).not.toBeInTheDocument();
  });
});
