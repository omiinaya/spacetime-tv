/**
 * Tests for useRecording and useRecordings — DVR recording lifecycle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRecording, useRecordings } from "@/hooks/useRecording";

// Mock fetch globally
function mockFetch(response: unknown, ok = true) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
  } as Response);
}

describe("useRecording", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts with no active recording", () => {
    const { result } = renderHook(() => useRecording());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.activeRecordingId).toBeNull();
  });

  it("startRecording sends POST and sets recording ID on success", async () => {
    const fetchMock = mockFetch({ recording_id: "abc123" });

    const { result } = renderHook(() => useRecording());

    let rid: string | null = null;
    await act(async () => {
      rid = await result.current.startRecording(42, "Test Channel");
    });

    expect(rid).toBe("abc123");
    expect(result.current.isRecording).toBe(true);
    expect(result.current.activeRecordingId).toBe("abc123");

    // Verify the fetch call
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/record/start"),
      expect.objectContaining({ method: "POST" }),
    );
    // Verify stream_id param
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("stream_id=42");
    expect(url).toContain("stream_name=Test+Channel");
  });

  it("startRecording returns null on server error", async () => {
    mockFetch({ detail: "Error" }, false);

    const { result } = renderHook(() => useRecording());

    let rid: string | null = "not_null";
    await act(async () => {
      rid = await result.current.startRecording(42);
    });

    expect(rid).toBeNull();
    expect(result.current.isRecording).toBe(false);
  });

  it("startRecording returns null on network error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useRecording());

    let rid: string | null = "not_null";
    await act(async () => {
      rid = await result.current.startRecording(42);
    });

    expect(rid).toBeNull();
  });

  it("stopRecording sends POST and clears state on success", async () => {
    mockFetch({ recording_id: "abc123" });

    const { result } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.startRecording(42);
    });
    expect(result.current.isRecording).toBe(true);

    // Now stop
    mockFetch({ status: "completed" });
    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.activeRecordingId).toBeNull();
  });

  it("stopRecording does nothing when no active recording", async () => {
    const fetchMock = vi.spyOn(global, "fetch");

    const { result } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cleans up on unmount — sends stop request", async () => {
    mockFetch({ recording_id: "abc123" });

    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.startRecording(42);
    });

    // Spy on fetch again for the unmount call
    const fetchSpy = mockFetch({ status: "completed" });

    unmount();

    // Should have sent a stop request
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/record/stop"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("useRecordings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches recordings on mount", async () => {
    const mockData = {
      recordings: [
        {
          id: "1",
          name: "Test",
          status: "completed",
          stream_id: 1,
          started_at: "2024-01-01T00:00:00",
          file: "/path/to/file.mp4",
          size_bytes: 1024,
        },
      ],
      total: 1,
    };
    mockFetch(mockData);

    const { result } = renderHook(() => useRecordings());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.recordings).toHaveLength(1);
    expect(result.current.recordings[0].name).toBe("Test");
  });

  it("starts with empty recordings on fetch error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useRecordings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.recordings).toEqual([]);
  });

  it("deleteRecording removes recording from list", async () => {
    const mockData = {
      recordings: [
        {
          id: "1",
          name: "A",
          status: "completed",
          stream_id: 1,
          started_at: "2024-01-01T00:00:00",
          file: "/path/1.mp4",
        },
        {
          id: "2",
          name: "B",
          status: "completed",
          stream_id: 2,
          started_at: "2024-01-02T00:00:00",
          file: "/path/2.mp4",
        },
      ],
      total: 2,
    };
    mockFetch(mockData);

    const { result } = renderHook(() => useRecordings());

    await waitFor(() => {
      expect(result.current.recordings).toHaveLength(2);
    });

    // Delete recording "1"
    mockFetch({ deleted: "1" });
    await act(async () => {
      await result.current.deleteRecording("1");
    });

    expect(result.current.recordings).toHaveLength(1);
    expect(result.current.recordings[0].id).toBe("2");
  });

  it("deleteRecording handles network error gracefully", async () => {
    const mockData = {
      recordings: [
        {
          id: "1",
          name: "A",
          status: "completed",
          stream_id: 1,
          started_at: "2024-01-01T00:00:00",
          file: "/path/1.mp4",
        },
      ],
      total: 1,
    };
    mockFetch(mockData);

    const { result } = renderHook(() => useRecordings());

    await waitFor(() => {
      expect(result.current.recordings).toHaveLength(1);
    });

    // Mock a failure
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Delete failed"));

    await act(async () => {
      await result.current.deleteRecording("1");
    });

    // Recording should still be in the list
    expect(result.current.recordings).toHaveLength(1);
  });
});
