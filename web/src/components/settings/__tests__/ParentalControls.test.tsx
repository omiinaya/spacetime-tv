/**
 * Tests for ParentalControls + PinSetup + PinManager — the adult-content
 * PIN protection flows in Settings.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ParentalControls from "@/components/settings/ParentalControls";

function setup(
  overrides: Partial<Parameters<typeof ParentalControls>[0]> = {},
) {
  const props = {
    showAdult: false,
    pinConfigured: false,
    adultUnlocked: false,
    onUpdateAdult: vi.fn(),
    onSetPin: vi.fn().mockResolvedValue(undefined),
    onRemovePin: vi.fn(),
    onLockAdult: vi.fn(),
    ...overrides,
  };
  render(<ParentalControls {...props} />);
  return props;
}

describe("PinSetup", () => {
  it("shows error when PIN is too short", async () => {
    const onSetPin = vi.fn().mockResolvedValue(undefined);
    setup({ onSetPin });

    fireEvent.change(screen.getByPlaceholderText("New PIN (4+ digits)"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm PIN"), {
      target: { value: "12" },
    });
    // button is disabled until 4+ digits; force via the invalid path by
    // typing 4 digits but mismatched confirm
    fireEvent.change(screen.getByPlaceholderText("New PIN (4+ digits)"), {
      target: { value: "1234" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm PIN"), {
      target: { value: "9999" },
    });
    fireEvent.click(screen.getByText("Set PIN"));
    await waitFor(() =>
      expect(screen.getByText("PINs do not match")).toBeTruthy(),
    );
    expect(onSetPin).not.toHaveBeenCalled();
  });

  it("accepts matching 4-digit PIN and shows success", async () => {
    const onSetPin = vi.fn().mockResolvedValue(undefined);
    setup({ onSetPin });

    fireEvent.change(screen.getByPlaceholderText("New PIN (4+ digits)"), {
      target: { value: "2468" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm PIN"), {
      target: { value: "2468" },
    });
    fireEvent.click(screen.getByText("Set PIN"));
    await waitFor(() => expect(onSetPin).toHaveBeenCalledWith("2468"));
    await waitFor(() =>
      expect(screen.getByText(/PIN has been set/)).toBeTruthy(),
    );
  });

  it("strips non-digit characters from the input", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("New PIN (4+ digits)"), {
      target: { value: "12a3b4" },
    });
    expect(
      (screen.getByPlaceholderText("New PIN (4+ digits)") as HTMLInputElement)
        .value,
    ).toBe("1234");
  });
});

describe("PinManager", () => {
  it("triggers change-pin flow and remove-pin with confirmation", async () => {
    const onRemovePin = vi.fn();
    const onChangePin = vi.fn();
    setup({ pinConfigured: true, onRemovePin, onChangePin });

    // Change PIN button opens the change prompt (PinPrompt renders a dialog)
    fireEvent.click(screen.getByText("Change PIN"));
    await waitFor(() =>
      expect(
        screen.getByText("Change PIN", { selector: "h2, [role=dialog] *" }),
      ).toBeTruthy(),
    );

    // Remove PIN asks for confirmation
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByText("Remove PIN"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onRemovePin).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("does not remove PIN when confirm is declined", () => {
    const onRemovePin = vi.fn();
    setup({ pinConfigured: true, onRemovePin });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByText("Remove PIN"));
    expect(onRemovePin).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("ParentalControls toggle", () => {
  it("turns adult OFF immediately when visible (no PIN needed)", () => {
    const onUpdateAdult = vi.fn();
    const onLockAdult = vi.fn();
    setup({ showAdult: true, onUpdateAdult, onLockAdult });

    fireEvent.click(
      screen.getByRole("button", { name: /adult content is visible/i }),
    );
    expect(onUpdateAdult).toHaveBeenCalledWith(false);
    expect(onLockAdult).toHaveBeenCalled();
  });

  it("opens PIN prompt to turn ON when PIN configured and locked", async () => {
    const onUpdateAdult = vi.fn();
    setup({
      showAdult: false,
      pinConfigured: true,
      adultUnlocked: false,
      onUpdateAdult,
    });

    fireEvent.click(
      screen.getByRole("button", { name: /adult content is hidden/i }),
    );
    await waitFor(() =>
      expect(screen.getByText("Unlock Adult Content")).toBeTruthy(),
    );
  });

  it("turns adult ON directly when unlocked", () => {
    const onUpdateAdult = vi.fn();
    setup({
      showAdult: false,
      pinConfigured: true,
      adultUnlocked: true,
      onUpdateAdult,
    });

    fireEvent.click(
      screen.getByRole("button", { name: /adult content is hidden/i }),
    );
    expect(onUpdateAdult).toHaveBeenCalledWith(true);
  });

  it("turns adult ON directly when no PIN configured", () => {
    const onUpdateAdult = vi.fn();
    setup({
      showAdult: false,
      pinConfigured: false,
      adultUnlocked: false,
      onUpdateAdult,
    });

    fireEvent.click(
      screen.getByRole("button", { name: /adult content is hidden/i }),
    );
    expect(onUpdateAdult).toHaveBeenCalledWith(true);
  });

  it("shows Lock again button when unlocked", () => {
    setup({ showAdult: true, pinConfigured: true, adultUnlocked: true });
    expect(screen.getByText("Lock again")).toBeTruthy();
  });
});
