/**
 * The UniFi settings editor renders the cloud/local mode toggle + the
 * matching field set, masks a previously-stored secret behind a
 * "•••• tersimpan" placeholder until "Ubah" is clicked, auto-extracts the
 * Console ID from a pasted cloud console URL, runs the SIMULATED "Uji
 * Koneksi" test through its pending/result states, saves the edited payload,
 * and surfaces a save error without a false "saved" state (each `it()` title
 * names its own owning acceptance criterion).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UnifiClient } from "./UnifiClient";
import { saveUnifiSettingsAction, testUnifiConnectionAction } from "./actions";
import type { UnifiSettingsInitial } from "./actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  saveUnifiSettingsAction: vi.fn(),
  testUnifiConnectionAction: vi.fn(),
}));

const emptyInitial: UnifiSettingsInitial = {
  connectionMode: "cloud",
  cloudConsoleUrl: "",
  consoleId: "",
  controllerHost: "",
  controllerPort: "",
  username: "",
  siteName: "default",
  hasApiKey: false,
  hasPassword: false,
};

describe("UnifiClient", () => {
  beforeEach(() => {
    vi.mocked(saveUnifiSettingsAction).mockReset();
    vi.mocked(testUnifiConnectionAction).mockReset();
  });

  it("AC: empty state — no config yet renders cloud mode selected with blank fields and the simulation banner", () => {
    render(<UnifiClient initial={emptyInitial} />);
    expect(screen.getByRole("button", { name: /Cloud/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/UniFi Cloud Console URL/i)).toHaveValue("");
    expect(screen.getByText(/integrasi UniFi menyusul/i)).toBeInTheDocument();
  });

  it("AC: a stored API key renders masked with a 'tersimpan' placeholder, not the real value, until 'Ubah' is clicked", () => {
    render(<UnifiClient initial={{ ...emptyInitial, hasApiKey: true }} />);
    expect(screen.getByLabelText(/Site Manager API Key/i)).toHaveValue("•••• tersimpan");
    expect(screen.getByLabelText(/Site Manager API Key/i)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Ubah/i }));
    expect(screen.getByLabelText(/Site Manager API Key/i)).toHaveValue("");
    expect(screen.getByLabelText(/Site Manager API Key/i)).toBeEnabled();
  });

  it("AC: switching to Local mode swaps the field set to host/port/username/password", () => {
    render(<UnifiClient initial={emptyInitial} />);
    fireEvent.click(screen.getByRole("button", { name: /Lokal/i }));
    expect(screen.getByRole("button", { name: /Lokal/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Controller Host/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Port$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/UniFi Cloud Console URL/i)).not.toBeInTheDocument();
  });

  it("AC: pasting a cloud console URL auto-extracts the Console ID", () => {
    render(<UnifiClient initial={emptyInitial} />);
    fireEvent.change(screen.getByLabelText(/UniFi Cloud Console URL/i), {
      target: { value: "https://unifi.ui.com/consoles/XYZ789/network/default/dashboard" },
    });
    expect(screen.getByText("XYZ789")).toBeInTheDocument();
  });

  it("AC: 'Uji Koneksi' runs a pending state then renders a success result from the simulated action", async () => {
    vi.mocked(testUnifiConnectionAction).mockResolvedValueOnce({
      outcome: "success",
      message: "Simulasi: semua komponen terhubung.",
    });
    render(<UnifiClient initial={emptyInitial} />);
    fireEvent.click(screen.getByRole("button", { name: /Uji Koneksi/i }));
    expect(screen.getByRole("button", { name: /Menguji/i })).toBeDisabled();
    await screen.findByText("Simulasi: semua komponen terhubung.");
  });

  it("AC: 'Uji Koneksi' renders a partial-success result", async () => {
    vi.mocked(testUnifiConnectionAction).mockResolvedValueOnce({
      outcome: "partial",
      message: "API Key valid, tapi Console ID tidak terdeteksi — proxy belum ter-adopt.",
    });
    render(<UnifiClient initial={emptyInitial} />);
    fireEvent.click(screen.getByRole("button", { name: /Uji Koneksi/i }));
    await screen.findByText(/proxy belum ter-adopt/);
  });

  it("AC: saving forwards the edited payload including a newly-typed API key", async () => {
    vi.mocked(saveUnifiSettingsAction).mockResolvedValueOnce(undefined);
    render(<UnifiClient initial={emptyInitial} />);
    fireEvent.change(screen.getByLabelText(/UniFi Cloud Console URL/i), {
      target: { value: "https://unifi.ui.com/consoles/XYZ789/network/default/dashboard" },
    });
    fireEvent.change(screen.getByLabelText(/Site Manager API Key/i), { target: { value: "new-key-123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

    await waitFor(() => expect(saveUnifiSettingsAction).toHaveBeenCalledTimes(1));
    expect(saveUnifiSettingsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionMode: "cloud",
        cloudConsoleUrl: "https://unifi.ui.com/consoles/XYZ789/network/default/dashboard",
        consoleId: "XYZ789",
        siteManagerApiKey: "new-key-123",
      }),
    );
    await screen.findByText("Tersimpan");
  });

  it("AC: saving with an unedited stored API key does not forward siteManagerApiKey at all", async () => {
    vi.mocked(saveUnifiSettingsAction).mockResolvedValueOnce(undefined);
    render(<UnifiClient initial={{ ...emptyInitial, hasApiKey: true, cloudConsoleUrl: "https://unifi.ui.com/consoles/ABC/network/default/dashboard", consoleId: "ABC" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

    await waitFor(() => expect(saveUnifiSettingsAction).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(saveUnifiSettingsAction).mock.calls[0][0];
    expect(payload).not.toHaveProperty("siteManagerApiKey");
  });

  it("AC: shows an error alert and no saved indicator when the save action rejects", async () => {
    vi.mocked(saveUnifiSettingsAction).mockRejectedValueOnce(new Error("INVALID_URL:cloudConsoleUrl"));
    render(<UnifiClient initial={{ ...emptyInitial, cloudConsoleUrl: "https://unifi.ui.com/consoles/ABC/network/default/dashboard", consoleId: "ABC" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Tersimpan")).not.toBeInTheDocument();
  });
});
