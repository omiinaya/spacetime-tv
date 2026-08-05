/**
 * Tests for ProviderSettings — the user-facing IPTV provider configuration
 * surface in Settings.
 *
 * Covers: loading state, rendering configured providers (password masked),
 * test-connection success/failure, add/edit/delete/toggle, validation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProviderSettings from "@/components/settings/ProviderSettings";
import type { ProviderListItem } from "@/lib/types";

const mockList = vi.fn();
const mockAdd = vi.fn();
const mockUpdateAt = vi.fn();
const mockRemove = vi.fn();
const mockToggle = vi.fn();
const mockTest = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    provider: {
      list: (...args: unknown[]) => mockList(...args),
      add: (...args: unknown[]) => mockAdd(...args),
      updateAt: (...args: unknown[]) => mockUpdateAt(...args),
      remove: (...args: unknown[]) => mockRemove(...args),
      toggle: (...args: unknown[]) => mockToggle(...args),
      test: (...args: unknown[]) => mockTest(...args),
    },
  },
  imageUrl: (url: string) => url,
}));

const provider: ProviderListItem = {
  index: 0,
  order: 0,
  name: "My Panel",
  base_url: "http://panel.live:8080",
  username: "user123",
  enabled: true,
  has_password: true,
  health: {
    last_ok: 1719000000,
    last_error: null,
    error_count: 0,
    ok_count: 5,
  },
};

const secondProvider: ProviderListItem = {
  index: 1,
  order: 1,
  name: "Backup",
  base_url: "http://backup.live:8080",
  username: "user456",
  enabled: false,
  has_password: true,
  health: {
    last_ok: null,
    last_error: null,
    error_count: 0,
    ok_count: 0,
  },
};

const emptyStat = () => ({
  last_ok: null,
  last_error: null,
  error_count: 0,
  ok_count: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ providers: [provider] });
  mockAdd.mockResolvedValue({
    message: "Provider added.",
    index: 1,
    provider: { ...provider, name: "New" },
  });
  mockUpdateAt.mockResolvedValue({
    message: "Provider updated.",
    provider,
  });
  mockRemove.mockResolvedValue({ message: "Provider deleted." });
  mockToggle.mockResolvedValue({
    message: "Provider disabled.",
    index: 0,
    enabled: false,
  });
  mockTest.mockResolvedValue({ ok: true, categories: 42 });
});

describe("ProviderSettings", () => {
  it("shows loading state while fetching", async () => {
    mockList.mockReturnValue(new Promise(() => {}));
    render(<ProviderSettings />);
    expect(
      await screen.findByText(/Loading provider configuration/i),
    ).toBeInTheDocument();
  });

  it("renders the provider list after load", async () => {
    render(<ProviderSettings />);
    expect(
      await screen.findByText(/Connect any Xtream Codes IPTV service/i),
    ).toBeInTheDocument();
    expect(screen.getByText("My Panel")).toBeInTheDocument();
    expect(screen.getByText("http://panel.live:8080")).toBeInTheDocument();
    expect(screen.getByText("user123")).toBeInTheDocument();
    // Primary badge on the first provider
    expect(screen.getByText("primary")).toBeInTheDocument();
    // Never render the password
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
  });

  it("renders an empty state when no provider is configured", async () => {
    mockList.mockResolvedValue({ providers: [] });
    render(<ProviderSettings />);
    expect(
      await screen.findByText(/No providers configured/i),
    ).toBeInTheDocument();
  });

  it("shows health badges per provider", async () => {
    mockList.mockResolvedValue({
      providers: [provider, secondProvider],
    });
    render(<ProviderSettings />);
    expect(await screen.findByText("healthy")).toBeInTheDocument();
    expect(screen.getByText("untested")).toBeInTheDocument();
    expect(screen.getByText("Backup")).toBeInTheDocument();
  });

  it("opens the add form and adds a provider", async () => {
    render(<ProviderSettings />);
    await screen.findByText(/Connect any Xtream Codes IPTV service/i);
    fireEvent.click(screen.getByText("Add provider"));
    fireEvent.change(screen.getByLabelText(/Base URL/i), {
      target: { value: "http://new.live" },
    });
    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: "newuser" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByText("Save provider"));
    await waitFor(() => {
      expect(screen.getByText("Provider added.")).toBeInTheDocument();
    });
    expect(mockAdd).toHaveBeenCalledWith({
      name: "Default",
      base_url: "http://new.live",
      username: "newuser",
      password: "secret",
      enabled: true,
    });
  });

  it("opens edit form pre-filled from an existing provider", async () => {
    render(<ProviderSettings />);
    await screen.findByText(/Connect any Xtream Codes IPTV service/i);
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => {
      const url = screen.getByLabelText(/Base URL/i) as HTMLInputElement;
      expect(url.value).toBe("http://panel.live:8080");
    });
    expect((screen.getByLabelText(/Username/i) as HTMLInputElement).value).toBe(
      "user123",
    );
    // Password field shows the "saved" placeholder, never the real password
    const pass = screen.getByLabelText("Password") as HTMLInputElement;
    expect(pass.value).toBe("");
    expect(
      screen.getByPlaceholderText(/saved — leave blank to keep/i),
    ).toBeInTheDocument();
  });

  it("saves an edit without re-entering the password", async () => {
    render(<ProviderSettings />);
    await screen.findByText(/Connect any Xtream Codes IPTV service/i);
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.click(screen.getByText("Save provider"));
    await waitFor(() => {
      expect(screen.getByText("Provider updated.")).toBeInTheDocument();
    });
    expect(mockUpdateAt).toHaveBeenCalledWith(0, {
      name: "My Panel",
      base_url: "http://panel.live:8080",
      username: "user123",
      password: undefined,
      enabled: true,
    });
  });

  it("test-connection success shows the category count", async () => {
    render(<ProviderSettings />);
    await screen.findByText(/Connect any Xtream Codes IPTV service/i);
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.click(screen.getByText("Test connection"));
    await waitFor(() => {
      expect(
        screen.getByText(/Connection OK — 42 categories found/i),
      ).toBeInTheDocument();
    });
    expect(mockTest).toHaveBeenCalledWith({
      base_url: "http://panel.live:8080",
      username: "user123",
      password: undefined,
    });
  });

  it("test-connection failure shows the upstream error", async () => {
    mockTest.mockResolvedValue({ ok: false, error: "connection refused" });
    render(<ProviderSettings />);
    await screen.findByText(/Connect any Xtream Codes IPTV service/i);
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.click(screen.getByText("Test connection"));
    await waitFor(() => {
      expect(
        screen.getByText(/Connection failed: connection refused/i),
      ).toBeInTheDocument();
    });
  });

  it("test-connection requires base URL and username", async () => {
    mockList.mockResolvedValue({ providers: [] });
    render(<ProviderSettings />);
    await screen.findByText(/No providers configured/i);
    fireEvent.click(screen.getByText("Add provider"));
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.click(screen.getByText("Test connection"));
    await waitFor(() => {
      expect(
        screen.getByText("Enter a base URL and username first."),
      ).toBeInTheDocument();
    });
    expect(mockTest).not.toHaveBeenCalled();
  });

  it("save validation requires base URL and username", async () => {
    mockList.mockResolvedValue({ providers: [] });
    render(<ProviderSettings />);
    await screen.findByText(/No providers configured/i);
    fireEvent.click(screen.getByText("Add provider"));
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.click(screen.getByText("Save provider"));
    await waitFor(() => {
      expect(
        screen.getByText("Base URL and username are required."),
      ).toBeInTheDocument();
    });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("toggles a provider on/off", async () => {
    render(<ProviderSettings />);
    await screen.findByText(/Connect any Xtream Codes IPTV service/i);
    fireEvent.click(screen.getByText("Disable"));
    await waitFor(() => {
      expect(screen.getByText("Provider disabled.")).toBeInTheDocument();
    });
    expect(mockToggle).toHaveBeenCalledWith(0);
  });

  it("deletes a provider after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProviderSettings />);
    await screen.findByText(/Connect any Xtream Codes IPTV service/i);
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(screen.getByText("Provider deleted.")).toBeInTheDocument();
    });
    expect(mockRemove).toHaveBeenCalledWith(0);
    confirmSpy.mockRestore();
  });

  it("does not delete without confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProviderSettings />);
    await screen.findByText(/Connect any Xtream Codes IPTV service/i);
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(screen.queryByText("Provider deleted.")).not.toBeInTheDocument();
    });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("renders untested badge for a provider with no health data", async () => {
    mockList.mockResolvedValue({
      providers: [{ ...provider, health: { ...emptyStat() } }],
    });
    render(<ProviderSettings />);
    await screen.findByText(/Connect any Xtream Codes IPTV service/i);
    expect(screen.getByText("untested")).toBeInTheDocument();
  });
});
