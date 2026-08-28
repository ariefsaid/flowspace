import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrintServerClient } from "./PrintServerClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ createPrintServerAction: vi.fn(), rotatePrintServerAction: vi.fn() }));

describe("PrintServerClient", () => {
  it("renders a one-time raw key alert but never the stored hash", () => {
    render(<PrintServerClient config={{ id: "cfg", keySelector: "public-selector", serverName: "Mini PC", isActive: true, lastSeenAt: null }} />);
    expect(screen.getByText("public-selector")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate|buat/i })).toBeInTheDocument();
    expect(screen.queryByText(/key_hash|sha/i)).not.toBeInTheDocument();
  });

  it("renders empty state when the server has no configuration", () => {
    render(<PrintServerClient config={null} />);
    expect(screen.getByText(/belum ada|belum dikonfigurasi/i)).toBeInTheDocument();
  });
});
