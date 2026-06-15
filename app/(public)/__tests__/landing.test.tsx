/**
 * AC-003: Landing page renders all 6 feature cards (OBS-003)
 * AC-004: Landing page renders 3 membership tier cards (OBS-004)
 * AC-005: Landing page renders orange CTA band with copy and signup link (OBS-005)
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "../page";

// next/link renders as <a> in test env
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

describe("LandingPage", () => {
  // -------------------------------------------------------------------------
  // OBS-003 / AC-003 — 6 feature cards
  // -------------------------------------------------------------------------
  describe("AC-003: Features section", () => {
    it("renders the section heading 'Semua yang Anda Butuhkan'", () => {
      render(<LandingPage />);
      expect(
        screen.getByRole("heading", { name: /Semua yang Anda Butuhkan/i }),
      ).toBeInTheDocument();
    });

    it("renders all 6 feature card titles", () => {
      render(<LandingPage />);
      const expectedTitles = [
        "Kredit Waktu",
        "Ruang Meeting",
        "Ruang Coworking",
        "Layanan Print",
        "Akses Digital",
        "Diskon Cafe",
      ];
      for (const title of expectedTitles) {
        expect(screen.getByText(title)).toBeInTheDocument();
      }
    });

    it("renders the Layanan Print description (was missing)", () => {
      render(<LandingPage />);
      expect(
        screen.getByText(/PaperCut/i),
      ).toBeInTheDocument();
    });

    it("renders the Akses Digital description with QR", () => {
      render(<LandingPage />);
      expect(
        screen.getByText(/QR code/i),
      ).toBeInTheDocument();
    });

    it("renders the Diskon Cafe description", () => {
      render(<LandingPage />);
      expect(
        screen.getByText(/diskon di cafe/i),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // OBS-004 / AC-004 — Membership section with 3 tiers (white-labeled)
  // -------------------------------------------------------------------------
  describe("AC-004: Membership section", () => {
    it("renders the section heading 'Paket Membership'", () => {
      render(<LandingPage />);
      expect(
        screen.getByRole("heading", { name: /Paket Membership/i }),
      ).toBeInTheDocument();
    });

    it("renders all 3 white-labeled tier names", () => {
      render(<LandingPage />);
      expect(screen.getByText("Regular")).toBeInTheDocument();
      expect(screen.getByText("Premium")).toBeInTheDocument();
      expect(screen.getByText("Gold Member")).toBeInTheDocument();
    });

    it("renders 'Paling Populer' badge on Gold Member tier", () => {
      render(<LandingPage />);
      expect(screen.getByText("Paling Populer")).toBeInTheDocument();
    });

    it("renders benefit items including discounts", () => {
      render(<LandingPage />);
      // Premium-specific benefit
      expect(screen.getByText(/Diskon coworking 50%/i)).toBeInTheDocument();
      // Gold Member-specific benefit
      expect(screen.getByText(/Diskon coworking 10%/i)).toBeInTheDocument();
    });

    it("each tier card has a link to /signup", () => {
      render(<LandingPage />);
      const signupLinks = screen
        .getAllByRole("link")
        .filter((el) => el.getAttribute("href") === "/signup");
      // Hero CTA + 3 membership cards + CTA band = at least 4
      expect(signupLinks.length).toBeGreaterThanOrEqual(4);
    });

    it("does NOT render client brand names (masking check)", () => {
      render(<LandingPage />);
      expect(screen.queryByText(/PERADI/i)).not.toBeInTheDocument();
      // "RBA" standalone (client brand abbreviation) — avoid matching "Sekarang" etc.
      const allText = document.body.textContent ?? "";
      expect(allText).not.toMatch(/\bRBA\b/);
    });
  });

  // -------------------------------------------------------------------------
  // OBS-005 / AC-005 — Orange CTA band with copy
  // -------------------------------------------------------------------------
  describe("AC-005: CTA band", () => {
    it("renders the CTA band heading", () => {
      render(<LandingPage />);
      expect(
        screen.getByRole("heading", {
          name: /Siap meningkatkan produktivitas Anda\?/i,
        }),
      ).toBeInTheDocument();
    });

    it("renders the CTA band subtext", () => {
      render(<LandingPage />);
      expect(
        screen.getByText(/Daftar sekarang dan mulai bekerja/i),
      ).toBeInTheDocument();
    });

    it("renders the 'Buat Akun Gratis' CTA button linking to /signup", () => {
      render(<LandingPage />);
      const cta = screen.getByRole("link", { name: /Buat Akun Gratis/i });
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveAttribute("href", "/signup");
    });
  });
});
