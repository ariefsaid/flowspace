/**
 * UsersClient — renders the DB-provided member directory (unit/RTL).
 *
 * AC-ADM-USERS-01: renders name, tier badge, email, join date for each member
 * AC-ADM-USERS-02: search narrows by name/email
 * AC-ADM-USERS-03: tier filter narrows by MembershipTier
 * AC-ADM-USERS-04: empty state shows when no members match
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UsersClient } from "./UsersClient";
import type { AdminUserView } from "./UsersClient";

const users: AdminUserView[] = [
  {
    id: "u1",
    name: "Budi Santoso",
    email: "budi@x.test",
    phone: "",
    tier: "PREMIUM",
    joinedAt: "2026-02-10T12:28:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u2",
    name: "Sari Wijaya",
    email: "sari@x.test",
    phone: "",
    tier: "GOLD",
    joinedAt: "2026-03-01T09:00:00+07:00",
    bookings: 0,
    transactions: 0,
  },
  {
    id: "u3",
    name: "Andi Pratama",
    email: "andi@x.test",
    phone: "",
    tier: "REGULAR",
    joinedAt: "2026-04-12T14:00:00+07:00",
    bookings: 0,
    transactions: 0,
  },
];

describe("UsersClient", () => {
  it("AC-ADM-USERS-01: renders name, tier badge, email for each member", () => {
    render(<UsersClient users={users} />);
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.getByText("Sari Wijaya")).toBeInTheDocument();
    expect(screen.getByText("Andi Pratama")).toBeInTheDocument();
    expect(screen.getByText("budi@x.test")).toBeInTheDocument();
    // Tier labels render
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gold").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Regular").length).toBeGreaterThan(0);
    // Members count header
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
});
