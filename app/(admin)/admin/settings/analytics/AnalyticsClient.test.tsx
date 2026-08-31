/**
 * The analytics editor renders the enable toggle + measurement-ID field
 * (empty state = unticked/blank), gives inline valid/invalid format feedback,
 * saves the edited payload, and surfaces a save error without a false
 * "saved" state (each `it()` title names its own owning acceptance
 * criterion).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AnalyticsClient } from "./AnalyticsClient";
import { saveAnalyticsSettingsAction } from "./actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ saveAnalyticsSettingsAction: vi.fn() }));

describe("AnalyticsClient", () => {
  beforeEach(() => {
    vi.mocked(saveAnalyticsSettingsAction).mockReset();
  });

  it("AC: empty state — no config yet renders an unticked toggle and a blank ID field", () => {
    render(<AnalyticsClient initial={{ measurementId: "", enabled: false }} />);
    expect(screen.getByLabelText("Aktifkan Google Analytics")).not.toBeChecked();
    expect(screen.getByLabelText("Measurement ID")).toHaveValue("");
    expect(screen.queryByText("Format ID valid")).not.toBeInTheDocument();
  });

  it("AC: renders seeded values and shows 'Format ID valid' for a well-formed ID", () => {
    render(<AnalyticsClient initial={{ measurementId: "G-ABC1234", enabled: true }} />);
    expect(screen.getByLabelText("Aktifkan Google Analytics")).toBeChecked();
    expect(screen.getByLabelText("Measurement ID")).toHaveValue("G-ABC1234");
    expect(screen.getByText("Format ID valid")).toBeInTheDocument();
  });

  it("AC: typing a malformed ID shows the format-invalid hint (not a hard block)", () => {
    render(<AnalyticsClient initial={{ measurementId: "", enabled: false }} />);
    fireEvent.change(screen.getByLabelText("Measurement ID"), { target: { value: "not-valid" } });
    expect(screen.getByText("Format harus G-XXXXXXXXXX")).toBeInTheDocument();
  });

  it("AC: toggling enabled + editing the ID forwards the edited payload on Save", async () => {
    vi.mocked(saveAnalyticsSettingsAction).mockResolvedValueOnce(undefined);
    render(<AnalyticsClient initial={{ measurementId: "", enabled: false }} />);
    fireEvent.click(screen.getByLabelText("Aktifkan Google Analytics"));
    fireEvent.change(screen.getByLabelText("Measurement ID"), { target: { value: "g-xyz9999" } });
    fireEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(saveAnalyticsSettingsAction).toHaveBeenCalledTimes(1));
    expect(saveAnalyticsSettingsAction).toHaveBeenCalledWith({
      measurementId: "G-XYZ9999",
      enabled: true,
    });
    await screen.findByText("Tersimpan");
  });

  it("AC: shows an error alert and no saved indicator when the save action rejects", async () => {
    vi.mocked(saveAnalyticsSettingsAction).mockRejectedValueOnce(new Error("INVALID_MEASUREMENT_ID"));
    render(<AnalyticsClient initial={{ measurementId: "G-ABC1234", enabled: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Simpan/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/Format Measurement ID/);
    expect(screen.queryByText("Tersimpan")).not.toBeInTheDocument();
  });
});
