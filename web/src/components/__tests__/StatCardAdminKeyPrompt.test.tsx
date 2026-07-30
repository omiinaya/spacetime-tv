import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Database, Tv } from "lucide-react";
import StatCard from "@/components/admin/StatCard";
import AdminKeyPrompt from "@/components/admin/AdminKeyPrompt";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard icon={Database} label="Cache" value={42} />);
    expect(screen.getByText("Cache")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("renders subtitle when provided", () => {
    render(
      <StatCard icon={Database} label="Hits" value={100} sub="extra info" />,
    );
    expect(screen.getByText("extra info")).toBeTruthy();
  });

  it("renders with a different icon", () => {
    const { container } = render(
      <StatCard icon={Tv} label="Streams" value={5} />,
    );
    const icons = container.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThan(0);
  });
});

describe("AdminKeyPrompt", () => {
  it("renders input and unlock button", () => {
    render(
      <AdminKeyPrompt
        pendingKey=""
        setPendingKey={vi.fn()}
        submitKey={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Admin key…")).toBeTruthy();
    expect(screen.getByText("Unlock")).toBeTruthy();
  });

  it("disables unlock when key is empty", () => {
    render(
      <AdminKeyPrompt
        pendingKey=""
        setPendingKey={vi.fn()}
        submitKey={vi.fn()}
      />,
    );
    expect(screen.getByText("Unlock")).toBeDisabled();
  });

  it("enables unlock when key is present", () => {
    render(
      <AdminKeyPrompt
        pendingKey="mykey"
        setPendingKey={vi.fn()}
        submitKey={vi.fn()}
      />,
    );
    expect(screen.getByText("Unlock")).not.toBeDisabled();
  });

  it("calls setPendingKey on input change", () => {
    const setPendingKey = vi.fn();
    render(
      <AdminKeyPrompt
        pendingKey=""
        setPendingKey={setPendingKey}
        submitKey={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Admin key…"), {
      target: { value: "newkey" },
    });
    expect(setPendingKey).toHaveBeenCalledWith("newkey");
  });

  it("calls submitKey on Enter key", () => {
    const submitKey = vi.fn();
    render(
      <AdminKeyPrompt
        pendingKey="test"
        setPendingKey={vi.fn()}
        submitKey={submitKey}
      />,
    );
    fireEvent.keyDown(screen.getByPlaceholderText("Admin key…"), {
      key: "Enter",
    });
    expect(submitKey).toHaveBeenCalled();
  });

  it("calls submitKey on button click", () => {
    const submitKey = vi.fn();
    render(
      <AdminKeyPrompt
        pendingKey="test"
        setPendingKey={vi.fn()}
        submitKey={submitKey}
      />,
    );
    fireEvent.click(screen.getByText("Unlock"));
    expect(submitKey).toHaveBeenCalled();
  });
});
