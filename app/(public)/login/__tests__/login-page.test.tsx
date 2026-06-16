/**
 * AC-003 (auth) — Bad credentials render the generic "Email atau kata sandi salah."
 * error message on the login page; no user-enumeration (same message regardless of
 * whether the email exists). This is the unit-layer owner for AC-003.
 *
 * We mock `next-auth/react` signIn so this test is pure component logic — no network,
 * no DB, no browser. The e2e layer proves the full cross-stack flow (AC-002 only).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSignIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  getSession: vi.fn().mockResolvedValue(null),
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
    mockSignIn.mockReset();
  });

  // -------------------------------------------------------------------------
  // AC-003 (auth): bad credentials → generic error, no enumeration
  // -------------------------------------------------------------------------
  it("AC-003 (auth): renders generic error when signIn returns an error (wrong password)", async () => {
    // signIn returns an error — wrong password case
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin", ok: false });

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
    // signIn returns an error — unknown email case; MUST produce identical message
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin", ok: false });

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
