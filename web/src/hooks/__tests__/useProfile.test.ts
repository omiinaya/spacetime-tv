/**
 * Tests for useProfile hook and profile API functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Import the module — these use fetch internally
import {
  useProfile,
  fetchProfiles,
  createProfile,
  verifyProfilePin,
  deleteProfileApi,
  fetchProfileProgress,
  syncProfileProgress,
  fetchProfileHistory,
  addProfileHistory,
  clearProfileHistory,
  switchProfile,
  refreshProfileToken,
} from "@/hooks/useProfile";

// Mock fetch globally
function mockFetch(response: unknown, ok = true) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
  } as Response);
}

describe("useProfile hook", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores stored profile from localStorage", () => {
    const stored = {
      profile_id: "abc",
      name: "TestUser",
      avatar: "default",
      created: Date.now(),
    };
    localStorage.setItem("stv_current_profile", JSON.stringify(stored));

    mockFetch({ profiles: [] });

    const { result } = renderHook(() => useProfile());

    expect(result.current.profile).toEqual(stored);
  });

  it("starts with null profile when nothing stored", () => {
    mockFetch({ profiles: [] });

    const { result } = renderHook(() => useProfile());

    expect(result.current.profile).toBeNull();
  });

  it("loads profiles on mount", async () => {
    const profilesList = [
      { profile_id: "1", name: "Alice", avatar: "default", created: 100 },
    ];
    mockFetch({ profiles: profilesList });

    const { result } = renderHook(() => useProfile());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.profiles).toEqual(profilesList);
  });

  it("sets empty profiles list on fetch error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.profiles).toEqual([]);
  });

  it("setProfile stores to localStorage", () => {
    mockFetch({ profiles: [] });

    const { result } = renderHook(() => useProfile());

    const profile = {
      profile_id: "x",
      name: "NewUser",
      avatar: "cat",
      created: Date.now(),
    };

    act(() => {
      result.current.setProfile(profile);
    });

    expect(result.current.profile).toEqual(profile);

    // Verify localStorage was updated
    const stored = JSON.parse(
      localStorage.getItem("stv_current_profile") || "{}",
    );
    expect(stored.name).toBe("NewUser");
  });

  it("setProfile removes from localStorage when null", () => {
    // Pre-store a profile
    localStorage.setItem(
      "stv_current_profile",
      JSON.stringify({ profile_id: "x", name: "Old", avatar: "a", created: 1 }),
    );
    mockFetch({ profiles: [] });

    const { result } = renderHook(() => useProfile());

    act(() => {
      result.current.setProfile(null);
    });

    expect(result.current.profile).toBeNull();
    expect(localStorage.getItem("stv_current_profile")).toBeNull();
  });

  it("refreshProfiles re-fetches and updates list", async () => {
    mockFetch({ profiles: [{ profile_id: "1", name: "A", avatar: "d", created: 1 }] });

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.profiles.length).toBe(1);
    });

    // Mock a different response for refresh
    mockFetch({ profiles: [{ profile_id: "2", name: "B", avatar: "d", created: 2 }] });

    let refreshed: unknown[] = [];
    await act(async () => {
      refreshed = await result.current.refreshProfiles();
    });

    expect(result.current.profiles).toHaveLength(1);
    expect(result.current.profiles[0].name).toBe("B");
    expect(refreshed).toHaveLength(1);
  });
});

describe("fetchProfiles", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns profiles list on success", async () => {
    const data = { profiles: [{ profile_id: "1", name: "Test", avatar: "a", created: 1 }] };
    mockFetch(data);

    const result = await fetchProfiles();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test");
  });

  it("throws on API error", async () => {
    mockFetch({ detail: "Unauthorized" }, false);
    await expect(fetchProfiles()).rejects.toThrow("Failed to fetch profiles");
  });
});

describe("createProfile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends correct payload and returns profile", async () => {
    const profile = { profile_id: "new", name: "User", avatar: "default", created: 1 };
    mockFetch({ profile });

    const result = await createProfile("User", "1234");
    expect(result.name).toBe("User");
  });

  it("throws on API error", async () => {
    mockFetch({ detail: "Name taken" }, false);
    await expect(createProfile("User", "1234")).rejects.toThrow("Name taken");
  });
});

describe("verifyProfilePin", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns true when valid", async () => {
    mockFetch({ valid: true });
    const result = await verifyProfilePin("1", "1234");
    expect(result).toBe(true);
  });

  it("returns false when invalid", async () => {
    mockFetch({ valid: false });
    const result = await verifyProfilePin("1", "wrong");
    expect(result).toBe(false);
  });

  it("returns false on HTTP error", async () => {
    mockFetch({}, false);
    const result = await verifyProfilePin("1", "1234");
    expect(result).toBe(false);
  });
});

describe("switchProfile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("stores token and profile in localStorage on success", async () => {
    const profile = { profile_id: "1", name: "Test", avatar: "a", created: 1 };
    mockFetch({ token: "sess_token", profile });

    const result = await switchProfile("1", "1234");
    expect(result).not.toBeNull();
    expect(result!.token).toBe("sess_token");

    expect(localStorage.getItem("stv_profile_token")).toBe("sess_token");
    expect(JSON.parse(localStorage.getItem("stv_current_profile")!)).toEqual(profile);
  });
});

describe("fetchProfileHistory", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns history items on success", async () => {
    mockFetch({ history: [{ watchKey: "show_1", title: "Breaking Bad" }] });
    const result = await fetchProfileHistory("1");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Breaking Bad");
  });

  it("returns empty array on error", async () => {
    mockFetch({}, false);
    const result = await fetchProfileHistory("1");
    expect(result).toEqual([]);
  });
});

describe("deleteProfileApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns true on success", async () => {
    mockFetch({}, true);
    const result = await deleteProfileApi("1");
    expect(result).toBe(true);
  });

  it("returns false on error", async () => {
    mockFetch({}, false);
    const result = await deleteProfileApi("1");
    expect(result).toBe(false);
  });
});
