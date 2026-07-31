/**
 * Tests for CloudBackupSection — cloud backup/restore/merge controls.
 *
 * Regression coverage: the section's Download & Restore and Merge Favorites
 * buttons must APPLY fetched data to localStorage (not just fetch it) and
 * reload the page so consumers re-read on mount. This logic was lost in the
 * SettingsPage extraction refactor and restored here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CloudBackupSection from "@/components/settings/CloudBackupSection";

const FAV_KEY = "stv_channel_favorites";
const WATCHLIST_KEY = "stv_watchlist";
const SERIES_KEY = "stv_watchlist_series";

function makeProps(
  overrides: Partial<Parameters<typeof CloudBackupSection>[0]> = {},
) {
  return {
    cloudLoading: false,
    cloudError: null,
    lastUpload: null,
    lastDownload: null,
    onUpload: vi.fn().mockResolvedValue(true),
    onDownload: vi.fn().mockResolvedValue(null),
    onMerge: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("CloudBackupSection", () => {
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    // jsdom's Location.prototype.reload is non-configurable, so replace the
    // whole window.location object with one carrying a mock reload.
    reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadMock },
    });
  });

  afterEach(() => {
    reloadMock.mockClear();
  });

  it("renders the three backup actions", () => {
    render(<CloudBackupSection {...makeProps()} />);
    expect(screen.getByText("Upload Backup")).toBeInTheDocument();
    expect(screen.getByText("Download & Restore")).toBeInTheDocument();
    expect(screen.getByText("Merge Favorites")).toBeInTheDocument();
  });

  it("Upload Backup calls onUpload and does not reload", async () => {
    const props = makeProps();
    render(<CloudBackupSection {...props} />);
    fireEvent.click(screen.getByText("Upload Backup"));
    expect(props.onUpload).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("Download & Restore applies favorites + both watchlists then reloads", async () => {
    const props = makeProps({
      onDownload: vi.fn().mockResolvedValue({
        favorites: [101, 202],
        watchlist: [1, 2],
        seriesWatchlist: [3, 4],
      }),
    });
    render(<CloudBackupSection {...props} />);
    fireEvent.click(screen.getByText("Download & Restore"));

    await vi.waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(FAV_KEY)).toBe(JSON.stringify([101, 202]));
    expect(localStorage.getItem(WATCHLIST_KEY)).toBe(JSON.stringify([1, 2]));
    expect(localStorage.getItem(SERIES_KEY)).toBe(JSON.stringify([3, 4]));
  });

  it("Download & Restore does nothing when download returns null", async () => {
    const props = makeProps({ onDownload: vi.fn().mockResolvedValue(null) });
    render(<CloudBackupSection {...props} />);
    fireEvent.click(screen.getByText("Download & Restore"));

    await vi.waitFor(() => expect(props.onDownload).toHaveBeenCalledTimes(1));
    expect(reloadMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(FAV_KEY)).toBeNull();
  });

  it("Merge Favorites applies merged favorites then reloads", async () => {
    const props = makeProps({
      onMerge: vi.fn().mockResolvedValue([100, 200, 300]),
    });
    render(<CloudBackupSection {...props} />);
    fireEvent.click(screen.getByText("Merge Favorites"));

    await vi.waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(FAV_KEY)).toBe(JSON.stringify([100, 200, 300]));
  });

  it("Merge Favorites does nothing when merge returns null", async () => {
    const props = makeProps({ onMerge: vi.fn().mockResolvedValue(null) });
    render(<CloudBackupSection {...props} />);
    fireEvent.click(screen.getByText("Merge Favorites"));

    await vi.waitFor(() => expect(props.onMerge).toHaveBeenCalledTimes(1));
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("displays cloud errors inline", () => {
    render(
      <CloudBackupSection {...makeProps({ cloudError: "Upload failed" })} />,
    );
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
  });

  it("disables buttons while a backup action is in flight", () => {
    const props = makeProps({ cloudLoading: true });
    render(<CloudBackupSection {...props} />);
    // While loading, labels switch to the -ing forms; all three must be disabled.
    for (const label of ["Uploading...", "Downloading...", "Merging..."]) {
      expect(screen.getByText(label).closest("button")).toBeDisabled();
    }
  });

  it("shows synced badge after an upload or download", () => {
    const { rerender } = render(
      <CloudBackupSection {...makeProps({ lastUpload: 1719000000 })} />,
    );
    expect(screen.getByText("synced")).toBeInTheDocument();

    rerender(
      <CloudBackupSection
        {...makeProps({ lastUpload: null, lastDownload: 1719000000 })}
      />,
    );
    expect(screen.getByText("synced")).toBeInTheDocument();
  });
});
