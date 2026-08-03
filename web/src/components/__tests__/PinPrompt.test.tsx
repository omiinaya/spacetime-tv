import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockUnlockAdult = vi.fn<() => Promise<boolean>>();

vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({
    unlockAdult: (...args: unknown[]) =>
      (mockUnlockAdult as unknown as (...a: unknown[]) => Promise<boolean>)(
        ...args,
      ),
    adultUnlocked: false,
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: () => {},
}));

import { PinPrompt } from "@/components/PinPrompt";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PinPrompt", () => {
  it("renders title, description, and the full numpad", () => {
    render(
      <PinPrompt
        onSuccess={() => {}}
        onCancel={() => {}}
        title="Parental Controls"
        description="Enter your PIN"
      />,
    );
    expect(screen.getByText("Enter your PIN")).toBeInTheDocument();
    for (const n of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
      expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    }
  });

  it("auto-submits a correct 4-digit PIN and fires onSuccess", async () => {
    mockUnlockAdult.mockResolvedValue(true);
    const onSuccess = vi.fn();
    render(<PinPrompt onSuccess={onSuccess} onCancel={() => {}} />);

    for (const d of ["1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
      // Let React commit each digit's state update before the next click so
      // handleDigit reads fresh `pin` (matches realistic human typing).
      await new Promise((r) => setTimeout(r, 20));
    }
    // Auto-submit fires after the internal 150ms delay.
    await waitFor(() => expect(mockUnlockAdult).toHaveBeenCalledWith("1234"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("shows an error and clears the PIN on an incorrect pin", async () => {
    mockUnlockAdult.mockResolvedValue(false);
    render(<PinPrompt onSuccess={() => {}} onCancel={() => {}} />);

    for (const d of ["9", "9", "9", "9"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
      await new Promise((r) => setTimeout(r, 0));
    }
    await waitFor(() => expect(mockUnlockAdult).toHaveBeenCalledWith("9999"));
    expect(await screen.findByText(/Incorrect PIN/)).toBeInTheDocument();
    // PIN field cleared (no filled dots).
    await waitFor(() => expect(screen.queryAllByText("●").length).toBe(0));
  });

  it("does not auto-submit with fewer than 4 digits", async () => {
    mockUnlockAdult.mockResolvedValue(true);
    const onCancel = vi.fn();
    render(<PinPrompt onSuccess={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await new Promise((r) => setTimeout(r, 300));
    expect(mockUnlockAdult).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("fires onCancel when Escape is pressed on the numpad", () => {
    const onCancel = vi.fn();
    render(<PinPrompt onSuccess={() => {}} onCancel={onCancel} />);
    // handleKeyDown lives on the numpad grid div; fire on a digit button so
    // the event bubbles to the grid.
    fireEvent.keyDown(screen.getByRole("button", { name: "5" }), {
      key: "Escape",
    });
    expect(onCancel).toHaveBeenCalled();
  });

  it("backspace removes the last entered digit", () => {
    render(<PinPrompt onSuccess={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "⌫" }));
    expect(screen.queryAllByText("●").length).toBe(0);
  });

  it("Clear empties the PIN field", () => {
    render(<PinPrompt onSuccess={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryAllByText("●").length).toBe(0);
  });
});
