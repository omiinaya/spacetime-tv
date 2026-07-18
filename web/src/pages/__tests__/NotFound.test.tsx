/**
 * Tests for the NotFound page — the only page without tests (was 11/12).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import NotFound from "@/pages/NotFound";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("NotFound", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  function renderNotFound() {
    return render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
  }

  it("renders the 404 heading", () => {
    renderNotFound();
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
  });

  it("renders the 'Page not found' message", () => {
    renderNotFound();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("renders the descriptive subtext", () => {
    renderNotFound();
    expect(
      screen.getByText(
        /The page you're looking for doesn't exist or has been moved/,
      ),
    ).toBeInTheDocument();
  });

  it("renders the TV icon", () => {
    renderNotFound();
    // lucide-react icons are SVG with role="img" or just svg
    const iconContainer = document.querySelector(".lucide-tv");
    expect(iconContainer).toBeInTheDocument();
  });

  it("renders the 'Go Home' button", () => {
    renderNotFound();
    const btn = screen.getByRole("button", { name: /go home/i });
    expect(btn).toBeInTheDocument();
  });

  it("renders the 'Go Back' button", () => {
    renderNotFound();
    const btn = screen.getByRole("button", { name: /go back/i });
    expect(btn).toBeInTheDocument();
  });

  it("'Go Home' button navigates to '/'", () => {
    renderNotFound();
    fireEvent.click(screen.getByRole("button", { name: /go home/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("'Go Back' button navigates to -1", () => {
    renderNotFound();
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("renders both buttons with icons", () => {
    renderNotFound();
    const homeBtn = screen.getByRole("button", { name: /go home/i });
    const backBtn = screen.getByRole("button", { name: /go back/i });

    // Each button should contain an SVG icon
    expect(homeBtn.querySelector("svg")).toBeInTheDocument();
    expect(backBtn.querySelector("svg")).toBeInTheDocument();
  });

  it("has the TV icon container with dark styling", () => {
    renderNotFound();
    // The TV icon sits in a rounded container
    const containers = document.querySelectorAll(".rounded-2xl");
    const iconContainer = Array.from(containers).find((el) =>
      el.querySelector(".lucide-tv"),
    );
    expect(iconContainer).toBeInTheDocument();
  });

  it("'Go Home' is the primary button style", () => {
    renderNotFound();
    const homeBtn = screen.getByRole("button", { name: /go home/i });
    expect(homeBtn.className).toContain("bg-primary");
  });

  it("'Go Back' is the secondary button style", () => {
    renderNotFound();
    const backBtn = screen.getByRole("button", { name: /go back/i });
    expect(backBtn.className).toContain("bg-secondary");
  });
});
