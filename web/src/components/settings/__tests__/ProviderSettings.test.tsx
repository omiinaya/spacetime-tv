/**
 * Tests for ProviderSettings — the user-facing IPTV provider configuration
 * surface in Settings.
 *
 * Covers: loading state, rendering a configured provider (password masked),
 * test-connection success/failure, save success/failure, empty-provider form.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProviderSettings from "@/components/settings/ProviderSettings";
import type { ProviderConfig } from "@/lib/types";

const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockTest = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    provider: {
      get: (...args: unknown[]) => mockGet(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      test: (...args: unknown[]) => mockTest(...args),
    },
  },
  imageUrl: (url: string) => url,
}));

const configuredProvider: ProviderConfig = {
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

const emptyStat = () => ({
  last_ok: null,
  last_error: null,
  error_count: 0,
  ok_count: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ configured: false, provider: null });
  mockUpdate.mockResolvedValue({
    message: "Provider saved.",
    provider: configuredProvider,
  });
  mockTest.mockResolvedValue({ ok: true, categories: 42 });
});

describe("ProviderSettings", () => {
  it("shows loading state while fetching", async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<ProviderSettings />);
    expect(
      await screen.findByText(/Loading provider configuration/i),
    ).toBeInTheDocument();
  });

  it("renders an empty form when no provider is configured", async () => {
    render(<ProviderSettings />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
    });
    expect((screen.getByLabelText(/Base URL/i) as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      screen.getByText(/Connect your Xtream Codes IPTV account/i),
    ).toBeInTheDocument();
  });

  it("pre-fills the form from a configured provider", async () => {
    mockGet.mockResolvedValue({
      configured: true,
      provider: configuredProvider,
    });
    render(<ProviderSettings />);
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
    // Health summary rendered
    expect(screen.getByText(/Last OK/i)).toBeInTheDocument();
  });

  it("test-connection success shows the category count", async () => {
    mockGet.mockResolvedValue({
      configured: true,
      provider: configuredProvider,
    });
    render(<ProviderSettings />);
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
    mockGet.mockResolvedValue({
      configured: true,
      provider: configuredProvider,
    });
    mockTest.mockResolvedValue({ ok: false, error: "connection refused" });
    render(<ProviderSettings />);
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.click(screen.getByText("Test connection"));
    await waitFor(() => {
      expect(
        screen.getByText(/Connection failed: connection refused/i),
      ).toBeInTheDocument();
    });
  });

  it("test-connection requires base URL and username", async () => {
    render(<ProviderSettings />);
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.click(screen.getByText("Test connection"));
    await waitFor(() => {
      expect(
        screen.getByText("Enter a base URL and username first."),
      ).toBeInTheDocument();
    });
    expect(mockTest).not.toHaveBeenCalled();
  });

  it("save submits the form and shows confirmation", async () => {
    render(<ProviderSettings />);
    await waitFor(() => screen.getByLabelText(/Base URL/i));
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
      expect(screen.getByText("Provider saved.")).toBeInTheDocument();
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      name: "Default",
      base_url: "http://new.live",
      username: "newuser",
      password: "secret",
      enabled: true,
    });
  });

  it("save without password keeps existing (omits password)", async () => {
    mockGet.mockResolvedValue({
      configured: true,
      provider: configuredProvider,
    });
    render(<ProviderSettings />);
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.click(screen.getByText("Save provider"));
    await waitFor(() =>
      expect(screen.getByText("Provider saved.")).toBeInTheDocument(),
    );
    // password left blank → undefined, so backend keeps the stored one
    expect(mockUpdate).toHaveBeenCalledWith({
      name: "My Panel",
      base_url: "http://panel.live:8080",
      username: "user123",
      password: undefined,
      enabled: true,
    });
  });

  it("save validation requires base URL and username", async () => {
    render(<ProviderSettings />);
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.click(screen.getByText("Save provider"));
    await waitFor(() => {
      expect(
        screen.getByText("Base URL and username are required."),
      ).toBeInTheDocument();
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("save surfaces a backend error", async () => {
    mockUpdate.mockRejectedValue(new Error("base_url is required"));
    render(<ProviderSettings />);
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    fireEvent.change(screen.getByLabelText(/Base URL/i), {
      target: { value: "http://x.live" },
    });
    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: "u" },
    });
    fireEvent.click(screen.getByText("Save provider"));
    await waitFor(() => {
      expect(screen.getByText("base_url is required")).toBeInTheDocument();
    });
  });

  it("renders provider status badge and untested state", async () => {
    mockGet.mockResolvedValue({
      configured: true,
      provider: {
        ...configuredProvider,
        health: { ...emptyStat() },
      },
    });
    render(<ProviderSettings />);
    await waitFor(() => screen.getByLabelText(/Base URL/i));
    expect(screen.getByText("untested")).toBeInTheDocument();
  });
});
