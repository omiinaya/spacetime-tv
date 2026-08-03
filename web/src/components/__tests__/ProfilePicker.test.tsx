import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyPin = vi.fn();
const mockCreateProfile = vi.fn();
const mockDeleteProfile = vi.fn();

vi.mock("@/hooks/useProfile", () => ({
  verifyProfilePin: (...args: unknown[]) =>
    (mockVerifyPin as unknown as (...a: unknown[]) => Promise<boolean>)(
      ...args,
    ),
  createProfile: (...args: unknown[]) =>
    (mockCreateProfile as unknown as (...a: unknown[]) => Promise<unknown>)(
      ...args,
    ),
  deleteProfileApi: (...args: unknown[]) =>
    (mockDeleteProfile as unknown as (...a: unknown[]) => Promise<boolean>)(
      ...args,
    ),
}));

import ProfilePicker from "@/components/ProfilePicker";

const profiles = [
  { profile_id: "p1", name: "Alice", avatar: "default" },
  { profile_id: "p2", name: "Bob", avatar: "emoji" },
];

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    profiles,
    loading: false,
    onSelect: vi.fn(),
    onRefresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Parameters<typeof ProfilePicker>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
});

describe("ProfilePicker", () => {
  it("shows loading spinner while loading", () => {
    render(<ProfilePicker {...makeProps({ loading: true })} />);
    expect(screen.getByText("Who's Watching?")).toBeInTheDocument();
  });

  it("selects an unlocked profile immediately", async () => {
    mockVerifyPin.mockResolvedValue(true);
    const onSelect = vi.fn();
    render(<ProfilePicker {...makeProps({ onSelect })} />);
    fireEvent.click(screen.getByText("Alice"));
    await waitFor(() => expect(mockVerifyPin).toHaveBeenCalledWith("p1", ""));
    expect(onSelect).toHaveBeenCalledWith(profiles[0]);
  });

  it("opens PIN entry for a locked profile and unlocks with correct pin", async () => {
    mockVerifyPin.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onSelect = vi.fn();
    render(<ProfilePicker {...makeProps({ onSelect })} />);
    fireEvent.click(screen.getByText("Alice"));
    // PIN modal appears.
    expect(await screen.findByText(/Enter PIN for Alice/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("●●●●"), {
      target: { value: "1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() =>
      expect(mockVerifyPin).toHaveBeenCalledWith("p1", "1234"),
    );
    expect(onSelect).toHaveBeenCalledWith(profiles[0]);
  });

  it("shows an error for an incorrect PIN", async () => {
    mockVerifyPin.mockResolvedValue(false);
    render(<ProfilePicker {...makeProps()} />);
    fireEvent.click(screen.getByText("Bob"));
    expect(await screen.findByText(/Enter PIN for Bob/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("●●●●"), {
      target: { value: "9999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText(/Incorrect PIN/)).toBeInTheDocument();
  });

  it("creates a profile with matching pins and refreshes", async () => {
    mockCreateProfile.mockResolvedValue({});
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<ProfilePicker {...makeProps({ onRefresh })} />);
    fireEvent.click(screen.getByText("Add Profile"));
    fireEvent.change(screen.getByPlaceholderText("Enter a name"), {
      target: { value: "Carol" },
    });
    const pinInputs = screen.getAllByPlaceholderText("●●●●");
    fireEvent.change(pinInputs[0], { target: { value: "4321" } });
    fireEvent.change(pinInputs[1], { target: { value: "4321" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Profile" }));
    await waitFor(() =>
      expect(mockCreateProfile).toHaveBeenCalledWith("Carol", "4321"),
    );
    expect(onRefresh).toHaveBeenCalled();
  });

  it("disables submit for mismatched PINs", async () => {
    render(<ProfilePicker {...makeProps()} />);
    fireEvent.click(screen.getByText("Add Profile"));
    fireEvent.change(screen.getByPlaceholderText("Enter a name"), {
      target: { value: "Dana" },
    });
    const pinInputs = screen.getAllByPlaceholderText("●●●●");
    fireEvent.change(pinInputs[0], { target: { value: "1111" } });
    fireEvent.change(pinInputs[1], { target: { value: "2222" } });
    const submit = screen.getByRole("button", { name: "Create Profile" });
    // Mismatched PINs → the submit button is disabled (guards submission).
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(mockCreateProfile).not.toHaveBeenCalled();
  });

  it("deletes a profile after confirmation", async () => {
    mockDeleteProfile.mockResolvedValue(true);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<ProfilePicker {...makeProps({ onRefresh })} />);
    const del = screen.getByRole("button", { name: "Delete profile Alice" });
    fireEvent.click(del);
    await waitFor(() => expect(mockDeleteProfile).toHaveBeenCalledWith("p1"));
    expect(onRefresh).toHaveBeenCalled();
  });
});
