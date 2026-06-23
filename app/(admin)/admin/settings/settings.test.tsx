/**
 * AC-405: the "Kategori Membership" settings card links to the pricing-config editor.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminSettingsPage from "./page";

describe("AdminSettingsPage", () => {
  it("AC-405: 'Kategori Membership' card links to /admin/settings/tiers", () => {
    render(<AdminSettingsPage />);
    const link = screen.getByRole("link", { name: /Kategori Membership/i });
    expect(link).toHaveAttribute("href", "/admin/settings/tiers");
  });
});
