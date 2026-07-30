import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBanner from "@/components/ErrorBanner";

describe("ErrorBanner", () => {
  it("renders the error message text", () => {
    render(<ErrorBanner message="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows a retry button when onRetry is provided", () => {
    render(<ErrorBanner message="Error" onRetry={() => {}} />);
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("hides the retry button when onRetry is not provided", () => {
    render(<ErrorBanner message="Error" />);
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Error" onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("has destructive styling class on the container", () => {
    const { container } = render(<ErrorBanner message="Error" />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain("text-destructive");
    expect(outerDiv.className).toContain("bg-destructive");
  });
});
