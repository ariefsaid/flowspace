/**
 * AC-003 (auth) — Bad credentials render the generic "Email atau kata sandi salah."
 * error message on the login page; no user-enumeration (same message regardless of
 * whether the email exists). This is the unit-layer owner for AC-003 on the
 * Supabase stack (ADR-0014).
 *
 * Supabase's `signInWithPassword` returns the SAME opaque `Invalid login credentials`
 * for both wrong-password and unknown-email, so enumeration resistance is inherited;
 * the component normalises ANY error to the one Indonesian message. We mock the
 * Supabase browser client so this is pure component logic — no network, no DB.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSignInWithPassword = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
    },
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/BrandMark", () => ({
  BrandMark: () => <span data-testid="brand-mark" />,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    type,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    type?: "submit" | "button" | "reset";
    disabled?: boolean;
    className?: string;
  }) => (
    <button type={type} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock("@/components/ui/Input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("lucide-react", () => ({
  Mail: () => <svg data-testid="mail-icon" />,
  Lock: () => <svg data-testid="lock-icon" />,
}));

import LoginPage from "../page";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("LoginPage", () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
  });

  // -------------------------------------------------------------------------
  // AC-003 (auth): bad credentials → generic error, no enumeration
  // -------------------------------------------------------------------------
  it("AC-003 (auth): renders generic error when Supabase returns an error (wrong password)", async () => {
    // Supabase returns its opaque error for the wrong-password case.
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "budi@flowspace.test" },
    });
    fireEvent.change(screen.getByLabelText(/kata sandi/i), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Email atau kata sandi salah.",
    );
  });

  it("AC-003 (auth): same generic error for unknown email — no enumeration", async () => {
    // Supabase returns the SAME opaque error for the unknown-email case → identical message.
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "nobody@unknown.test" },
    });
    fireEvent.change(screen.getByLabelText(/kata sandi/i), {
      target: { value: "any-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Must be the same message — no enumeration
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Email atau kata sandi salah.",
    );
  });

  it("renders the login form with email and password fields", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/kata sandi/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /masuk/i })).toBeInTheDocument();
  });

  it("does not show an error on initial render", () => {
    render(<LoginPage />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
