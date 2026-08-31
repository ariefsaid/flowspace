/**
 * The email-settings editor renders notification toggles + sender-name
 * populated from seeded values (empty state = default false/blank), saves
 * on submit, surfaces a save error without a false "saved" state, and the
 * "Kirim Email Uji" button simulates a send with the disclosed-simulation
 * label — never claims a real send (each `it()` title names its own owning
 * acceptance criterion).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EmailClient } from "./EmailClient";
import { saveEmailSettingsAction, type EmailSettingsInput } from "./actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ saveEmailSettingsAction: vi.fn() }));

const seeded: EmailSettingsInput = {
  senderName: "FlowSpace",
  registrationEnabled: true,
  bookingEnabled: true,
  paymentEnabled: false,
};

const empty: EmailSettingsInput = {
  senderName: "",
  registrationEnabled: false,
  bookingEnabled: false,
  paymentEnabled: false,
};

describe("EmailClient", () => {
  beforeEach(() => {
    vi.mocked(saveEmailSettingsAction).mockReset();
  });

  it("AC: renders sender-name + three notification toggles populated from seeded values", () => {
    render(<EmailClient initial={seeded} />);
    expect(screen.getByLabelText("Nama Pengirim")).toHaveValue("FlowSpace");
    expect(screen.getByLabelText("Email Registrasi")).toBeChecked();
    expect(screen.getByLabelText("Email Booking")).toBeChecked();
    expect(screen.getByLabelText("Email Payment Receipt")).not.toBeChecked();
    expect(screen.getByRole("button", { name: /Simpan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kirim Email Uji/i })).toBeInTheDocument();
  });

  it("AC: empty state — no config yet renders every toggle off and a blank sender name", () => {
    render(<EmailClient initial={empty} />);
    expect(screen.getByLabelText("Nama Pengirim")).toHaveValue("");
    expect(screen.getByLabelText("Email Registrasi")).not.toBeChecked();
    expect(screen.getByLabelText("Email Booking")).not.toBeChecked();
    expect(screen.getByLabelText("Email Payment Receipt")).not.toBeChecked();
  });

  it("AC: toggling a notification and saving forwards the edited payload", async () => {
    vi.mocked(saveEmailSettingsAction).mockResolvedValueOnce(undefined);
    render(<EmailClient initial={empty} />);
    fireEvent.click(screen.getByLabelText("Email Booking"));
    fireEvent.change(screen.getByLabelText("Nama Pengirim"), { target: { value: "FlowSpace Hub" } });
    fireEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

    await waitFor(() => expect(saveEmailSettingsAction).toHaveBeenCalledTimes(1));
    expect(saveEmailSettingsAction).toHaveBeenCalledWith({
      senderName: "FlowSpace Hub",
      registrationEnabled: false,
      bookingEnabled: true,
      paymentEnabled: false,
    });
    await screen.findByText("Tersimpan");
  });

  it("AC: shows an error alert and no saved indicator when the save action rejects", async () => {
    vi.mocked(saveEmailSettingsAction).mockRejectedValueOnce(new Error("INVALID_LENGTH:senderName"));
    render(<EmailClient initial={seeded} />);
    fireEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/maksimal 500 karakter/);
    expect(screen.queryByText("Tersimpan")).not.toBeInTheDocument();
  });

  it("AC: 'Kirim Email Uji' simulates a send and discloses it is a simulation, no real send claimed", async () => {
    render(<EmailClient initial={seeded} />);
    const testButton = screen.getByRole("button", { name: /Kirim Email Uji/i });
    fireEvent.click(testButton);
    expect(screen.getByText(/Mengirim…/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Simulasi — integrasi email menyusul.",
    );
    // saving the real settings never fires from the test-send affordance
    expect(saveEmailSettingsAction).not.toHaveBeenCalled();
  });
});
