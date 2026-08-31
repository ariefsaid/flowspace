/**
 * UsersClient — renders the DB-provided member directory (unit/RTL) and
 * wires the edit / credit-adjust / archive / password-reset dialogs to the
 * already-built server actions (I-047).
 *
 * AC-ADM-USERS-01: renders name, tier badge, email, join date for each member
 * AC-ADM-USERS-02: search narrows by name/email
 * AC-ADM-USERS-03: tier filter narrows by MembershipTier
 * AC-ADM-USERS-04: empty state shows when no members match
 * AC-ADM-USERS-05: edit dialog saves name/role/tier via updateUserAction
 * AC-ADM-USERS-06: edit dialog surfaces an invalid-role rejection inline, dialog stays open
 * AC-ADM-USERS-07: edit dialog surfaces an invalid-tier rejection inline, dialog stays open
 * AC-ADM-USERS-08: credit-adjust dialog applies a delta via adjustCreditsAction
 * AC-ADM-USERS-09: archive refuses an ADMIN target (CANNOT_ARCHIVE_ADMIN) with a clear inline message
 * AC-ADM-USERS-10: password reset rejects a too-short password inline and never echoes it back
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { UsersClient } from "./UsersClient";
import type { AdminUserView } from "./UsersClient";
import {
  updateUserAction,
  archiveUserAction,
  adjustCreditsAction,
  resetUserPasswordAction,
} from "./actions";
import type { AppUser } from "@/lib/db/schema";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  updateUserAction: vi.fn(),
  archiveUserAction: vi.fn(),
  adjustCreditsAction: vi.fn(),
  resetUserPasswordAction: vi.fn(),
}));

function makeAppUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "u1",
    orgId: "o1",
    authUserId: "auth-1",
    email: "budi@x.test",
    name: "Budi Santoso",
    role: "MEMBER",
    membershipTier: "PREMIUM",
    timeCredits: 5,
    printBalance: 10,
    createdAt: new Date("2026-02-10T05:28:00.000Z"),
    updatedAt: new Date("2026-02-10T05:28:00.000Z"),
    archivedAt: null,
    ...overrides,
  } as AppUser;
}

const users: AdminUserView[] = [
  {
    id: "u1",
    name: "Budi Santoso",
    email: "budi@x.test",
    phone: "",
    role: "MEMBER",
    tier: "PREMIUM",
    joinedAt: "2026-02-10T12:28:00+07:00",
    bookings: 0,
    transactions: 0,
    timeCredits: 5,
    printBalance: 10,
  },
  {
    id: "u2",
    name: "Sari Wijaya",
    email: "sari@x.test",
    phone: "",
    role: "ADMIN",
    tier: "GOLD",
    joinedAt: "2026-03-01T09:00:00+07:00",
    bookings: 0,
    transactions: 0,
    timeCredits: 0,
    printBalance: 0,
  },
  {
    id: "u3",
    name: "Andi Pratama",
    email: "andi@x.test",
    phone: "",
    role: "MEMBER",
    tier: "REGULAR",
    joinedAt: "2026-04-12T14:00:00+07:00",
    bookings: 0,
    transactions: 0,
    timeCredits: 0,
    printBalance: 0,
  },
];

describe("UsersClient", () => {
  beforeEach(() => {
    vi.mocked(updateUserAction).mockReset();
    vi.mocked(archiveUserAction).mockReset();
    vi.mocked(adjustCreditsAction).mockReset();
    vi.mocked(resetUserPasswordAction).mockReset();
  });

  it("AC-ADM-USERS-01: renders name, tier badge, email for each member", () => {
    render(<UsersClient users={users} />);
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.getByText("Sari Wijaya")).toBeInTheDocument();
    expect(screen.getByText("Andi Pratama")).toBeInTheDocument();
    expect(screen.getByText("budi@x.test")).toBeInTheDocument();
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gold").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Regular").length).toBeGreaterThan(0);
    expect(screen.getByText(/Members \(3\)/)).toBeInTheDocument();
  });

  it("AC-ADM-USERS-02: search narrows by name", () => {
    render(<UsersClient users={users} />);
    const input = screen.getByPlaceholderText(/Cari nama atau email/i);
    fireEvent.change(input, { target: { value: "sari" } });
    expect(screen.getByText("Sari Wijaya")).toBeInTheDocument();
    expect(screen.queryByText("Budi Santoso")).not.toBeInTheDocument();
    expect(screen.queryByText("Andi Pratama")).not.toBeInTheDocument();
  });

  it("AC-ADM-USERS-02: search narrows by email", () => {
    render(<UsersClient users={users} />);
    const input = screen.getByPlaceholderText(/Cari nama atau email/i);
    fireEvent.change(input, { target: { value: "andi@x.test" } });
    expect(screen.getByText("Andi Pratama")).toBeInTheDocument();
    expect(screen.queryByText("Budi Santoso")).not.toBeInTheDocument();
  });

  it("AC-ADM-USERS-03: tier filter narrows by MembershipTier", () => {
    render(<UsersClient users={users} />);
    const select = screen.getByDisplayValue("Semua Membership") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "GOLD" } });
    expect(screen.getByText("Sari Wijaya")).toBeInTheDocument();
    expect(screen.queryByText("Budi Santoso")).not.toBeInTheDocument();
    expect(screen.queryByText("Andi Pratama")).not.toBeInTheDocument();
  });

  it("AC-ADM-USERS-04: empty state shows when no members match the search", () => {
    render(<UsersClient users={users} />);
    const input = screen.getByPlaceholderText(/Cari nama atau email/i);
    fireEvent.change(input, { target: { value: "zzz-no-match" } });
    expect(screen.getByText(/Tidak ada member yang ditemukan/i)).toBeInTheDocument();
  });

  it("AC-ADM-USERS-04: empty state shows when the directory is empty", () => {
    render(<UsersClient users={[]} />);
    expect(screen.getByText(/Tidak ada member yang ditemukan/i)).toBeInTheDocument();
  });

  it("AC-ADM-USERS-05: edit dialog saves name/role/tier via updateUserAction and closes on success", async () => {
    vi.mocked(updateUserAction).mockResolvedValueOnce(
      makeAppUser({ id: "u1", name: "Budi S.", role: "MEMBER", membershipTier: "GOLD" }),
    );
    render(<UsersClient users={users} />);

    fireEvent.click(screen.getByRole("button", { name: /edit budi santoso/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/nama/i)).toHaveValue("Budi Santoso");

    fireEvent.change(within(dialog).getByLabelText(/nama/i), { target: { value: "Budi S." } });
    fireEvent.change(within(dialog).getByLabelText(/membership/i), { target: { value: "GOLD" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(updateUserAction).toHaveBeenCalledTimes(1));
    expect(updateUserAction).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ name: "Budi S.", role: "MEMBER", membershipTier: "GOLD" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Budi S.")).toBeInTheDocument();
  });

  it("AC-ADM-USERS-06: edit dialog surfaces an invalid-role rejection inline and keeps the dialog open", async () => {
    vi.mocked(updateUserAction).mockRejectedValueOnce(new Error("INVALID_ROLE"));
    render(<UsersClient users={users} />);

    fireEvent.click(screen.getByRole("button", { name: /edit budi santoso/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(within(dialog).getByText(/role tidak valid/i)).toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("AC-ADM-USERS-07: edit dialog surfaces an invalid-tier rejection inline and keeps the dialog open", async () => {
    vi.mocked(updateUserAction).mockRejectedValueOnce(new Error("INVALID_TIER"));
    render(<UsersClient users={users} />);

    fireEvent.click(screen.getByRole("button", { name: /edit budi santoso/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(within(dialog).getByText(/membership tidak valid/i)).toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("AC-ADM-USERS-08: credit-adjust dialog applies a delta via adjustCreditsAction", async () => {
    vi.mocked(adjustCreditsAction).mockResolvedValueOnce({ timeCredits: 8, printBalance: 10 });
    render(<UsersClient users={users} />);

    fireEvent.click(screen.getByRole("button", { name: /sesuaikan saldo budi santoso/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/kredit waktu/i), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(adjustCreditsAction).toHaveBeenCalledTimes(1));
    expect(adjustCreditsAction).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ timeCreditsDelta: 3, printBalanceDelta: 0 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("AC-ADM-USERS-09: archive refuses an ADMIN target with a clear inline message and stays open", async () => {
    vi.mocked(archiveUserAction).mockRejectedValueOnce(new Error("CANNOT_ARCHIVE_ADMIN"));
    render(<UsersClient users={users} />);

    fireEvent.click(screen.getByRole("button", { name: /arsipkan sari wijaya/i }));
    const confirm = screen.getByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: /^arsipkan$/i }));

    await waitFor(() =>
      expect(within(confirm).getByText(/admin tidak bisa diarsipkan/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Sari Wijaya")).toBeInTheDocument();
  });

  it("archives a non-admin only after the confirm dialog is accepted, then removes the row", async () => {
    vi.mocked(archiveUserAction).mockResolvedValueOnce(makeAppUser({ id: "u1" }));
    render(<UsersClient users={users} />);

    fireEvent.click(screen.getByRole("button", { name: /arsipkan budi santoso/i }));
    const confirm = screen.getByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: /batal/i }));
    expect(archiveUserAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /arsipkan budi santoso/i }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /^arsipkan$/i }));

    await waitFor(() => expect(archiveUserAction).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(screen.queryByText("Budi Santoso")).not.toBeInTheDocument());
  });

  it("AC-ADM-USERS-10: password reset rejects a too-short password inline and never echoes it back", async () => {
    vi.mocked(updateUserAction).mockResolvedValueOnce(makeAppUser({ id: "u1" }));
    vi.mocked(resetUserPasswordAction).mockRejectedValueOnce(new Error("PASSWORD_TOO_SHORT"));
    render(<UsersClient users={users} />);

    fireEvent.click(screen.getByRole("button", { name: /edit budi santoso/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/password baru/i), { target: { value: "abc" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(resetUserPasswordAction).toHaveBeenCalledWith("u1", "abc"));
    await waitFor(() =>
      expect(within(dialog).getByText(/password minimal 6 karakter/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Never echoes the password back into any visible text/value elsewhere on the page.
    expect(screen.queryByDisplayValue("abc")).toBe(within(dialog).getByLabelText(/password baru/i));
    expect(screen.queryByText("abc")).not.toBeInTheDocument();
  });
});
