/**
 * Tests for the ChannelRow component.
 *
 * ChannelRow renders a single guide row with channel info, favorite
 * toggle, and horizontal programme cards. ProgrammeCard (internal)
 * provides live/upcoming display, progress bar, and hover enrichment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChannelRow } from "@/components/ChannelRow";
import type { ChannelGroup, Programme } from "@/lib/api";

// ── Mock api.guide.enrich used by ProgrammeCard ────────────────

vi.mock("@/lib/api", () => ({
  api: {
    guide: {
      enrich: vi.fn(),
    },
  },
  imageUrl: (url: string) => url,
}));

import { api } from "@/lib/api";
const mockEnrich = api.guide.enrich as ReturnType<typeof vi.fn>;

// ── Sample data ────────────────────────────────────────────────

const now = new Date("2026-06-27T12:00:00Z");

const baseProgramme: Programme = {
  start: "20260627113000 +0000",
  stop: "20260627130000 +0000",
  title: "Midday News",
  subtitle: "World News Today",
  desc: "A comprehensive roundup of today's top stories from around the world.",
  category: "News, Current Affairs",
  is_live: true,
};

const upcomingProgramme: Programme = {
  start: "20260627130000 +0000",
  stop: "20260627143000 +0000",
  title: "Afternoon Movie",
  subtitle: "Classic Cinema",
  desc: "A timeless classic from the golden age of cinema.",
  category: "Movies, Entertainment",
  is_live: false,
};

const sampleGroup: ChannelGroup = {
  channel_id: "bbc-1",
  channel_name: "BBC One",
  channel_icon: "https://example.com/bbc-one.png",
  stream_id: 1001,
  programmes: [baseProgramme, upcomingProgramme],
};

const groupNoStream: ChannelGroup = {
  channel_id: "no-stream-ch",
  channel_name: "Audio Only",
  channel_icon: "",
  stream_id: null,
  programmes: [],
};

const groupNoProgrammes: ChannelGroup = {
  channel_id: "empty-ch",
  channel_name: "Empty Channel",
  channel_icon: "",
  stream_id: 2002,
  programmes: [],
};

// ── Helper ──────────────────────────────────────────────────────

function renderChannelRow(options: {
  group?: ChannelGroup;
  now?: Date;
  rowIndex?: number;
  focusedCol?: number;
  onFocusCol?: (col: number) => void;
  onPlay?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
} = {}) {
  return render(
    <ChannelRow
      group={options.group ?? sampleGroup}
      now={options.now ?? now}
      rowIndex={options.rowIndex ?? 0}
      focusedCol={options.focusedCol ?? -2}
      onFocusCol={options.onFocusCol ?? vi.fn()}
      onPlay={options.onPlay ?? vi.fn()}
      isFavorite={options.isFavorite}
      onToggleFavorite={options.onToggleFavorite}
    />
  );
}

// ── Tests ──────────────────────────────────────────────────────

describe("ChannelRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnrich.mockResolvedValue(null);
  });

  describe("channel info", () => {
    it("renders the channel name", () => {
      renderChannelRow();
      expect(screen.getByText("BBC One")).toBeInTheDocument();
    });

    it("renders channel icon when available", () => {
      renderChannelRow();
      const img = screen.getByAltText("BBC One icon");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://example.com/bbc-one.png");
    });

    it("falls back to Tv icon when no channel_icon is provided", () => {
      renderChannelRow({ group: groupNoStream });
      expect(screen.queryByAltText("Audio Only icon")).not.toBeInTheDocument();
      expect(screen.getByText("Audio Only")).toBeInTheDocument();
    });
  });

  describe("play button / stream availability", () => {
    it("shows playable channel button with stream available label", () => {
      const onPlay = vi.fn();
      renderChannelRow({ onPlay });

      const playBtn = screen.getByLabelText("Watch BBC One");
      expect(playBtn).toBeInTheDocument();
      expect(playBtn).not.toBeDisabled();
    });

    it("calls onPlay when play button clicked", () => {
      const onPlay = vi.fn();
      renderChannelRow({ onPlay });

      fireEvent.click(screen.getByLabelText("Watch BBC One"));
      expect(onPlay).toHaveBeenCalledTimes(1);
    });

    it("shows disabled state and aria-label when no stream available", () => {
      const onPlay = vi.fn();
      renderChannelRow({ group: groupNoStream, onPlay });

      const playBtn = screen.getByLabelText("Audio Only — no stream available");
      expect(playBtn).toBeDisabled();
    });

    it("does not call onPlay when button is disabled (no stream)", () => {
      const onPlay = vi.fn();
      renderChannelRow({ group: groupNoStream, onPlay });

      const playBtn = screen.getByLabelText("Audio Only — no stream available");
      fireEvent.click(playBtn);
      expect(onPlay).not.toHaveBeenCalled();
    });
  });

  describe("programme cards", () => {
    it("renders the live programme title", () => {
      renderChannelRow();
      expect(screen.getByText("Midday News")).toBeInTheDocument();
    });

    it("renders upcoming programme title", () => {
      renderChannelRow();
      expect(screen.getByText("Afternoon Movie")).toBeInTheDocument();
    });

    it("renders LIVE badge for live programmes", () => {
      renderChannelRow();
      expect(screen.getByText("LIVE")).toBeInTheDocument();
    });

    it("shows progress bar for live programmes", () => {
      renderChannelRow();
      const progressFill = document.querySelector('[style*="width:"]');
      expect(progressFill).toBeInTheDocument();
    });

    it("shows programme time range", () => {
      renderChannelRow();
      const timeElements = screen.getAllByText(/–/);
      expect(timeElements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows "No title" fallback for programmes without a title', () => {
      const noTitleGroup: ChannelGroup = {
        ...sampleGroup,
        programmes: [{ ...baseProgramme, title: "" }],
      };
      renderChannelRow({ group: noTitleGroup });
      expect(screen.getByText("No title")).toBeInTheDocument();
    });

    it('shows "No upcoming programmes" when programmes array is empty', () => {
      renderChannelRow({ group: groupNoProgrammes });
      expect(screen.getByText("No upcoming programmes")).toBeInTheDocument();
    });

    it("shows description icon (Info) when programme has a desc", () => {
      renderChannelRow();
      const infoIcons = document.querySelectorAll("svg");
      expect(infoIcons.length).toBeGreaterThan(0);
    });
  });

  describe("hover popover", () => {
    it("shows programme description and category badges on hover", async () => {
      renderChannelRow();
      const programmeBtn = screen.getByLabelText(/Midday News/);

      fireEvent.mouseEnter(programmeBtn);

      await waitFor(() => {
        expect(screen.getByText(/comprehensive roundup/)).toBeInTheDocument();
      });

      expect(screen.getByText("News")).toBeInTheDocument();
      expect(screen.getByText("Current Affairs")).toBeInTheDocument();
    });

    it("hides popover on mouse leave", async () => {
      renderChannelRow();
      const programmeBtn = screen.getByLabelText(/Midday News/);

      fireEvent.mouseEnter(programmeBtn);
      await waitFor(() => {
        expect(screen.getByText(/comprehensive roundup/)).toBeInTheDocument();
      });

      fireEvent.mouseLeave(programmeBtn);
      await waitFor(() => {
        expect(screen.queryByText(/comprehensive roundup/)).not.toBeInTheDocument();
      });
    });

    it("shows loading spinner while enrichment loads", async () => {
      mockEnrich.mockReturnValue(new Promise(() => {}));

      renderChannelRow();
      const programmeBtn = screen.getByLabelText(/Midday News/);
      fireEvent.mouseEnter(programmeBtn);

      await waitFor(() => {
        const spinners = document.querySelectorAll(".animate-spin");
        expect(spinners.length).toBeGreaterThan(0);
      });
    });

    it("fallbacks to programme description when enrichment returns no result", async () => {
      renderChannelRow();
      const programmeBtn = screen.getByLabelText(/Midday News/);
      fireEvent.mouseEnter(programmeBtn);

      await waitFor(() => {
        expect(screen.getByText(/comprehensive roundup/)).toBeInTheDocument();
      });
    });
  });

  describe("favorite toggle", () => {
    it("shows favorite star button when onToggleFavorite is provided", () => {
      const onToggleFavorite = vi.fn();
      renderChannelRow({ onToggleFavorite });

      const addBtn = screen.getByLabelText("Add to favorites");
      expect(addBtn).toBeInTheDocument();
    });

    it("does not show favorite button when onToggleFavorite is not provided", () => {
      renderChannelRow();
      expect(screen.queryByLabelText("Add to favorites")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Remove from favorites")).not.toBeInTheDocument();
    });

    it("calls onToggleFavorite when star button clicked", () => {
      const onToggleFavorite = vi.fn();
      renderChannelRow({ onToggleFavorite });

      fireEvent.click(screen.getByLabelText("Add to favorites"));
      expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    });

    it("shows Remove from favorites label when isFavorite is true", () => {
      const onToggleFavorite = vi.fn();
      renderChannelRow({ onToggleFavorite, isFavorite: true });

      expect(screen.getByLabelText("Remove from favorites")).toBeInTheDocument();
      expect(screen.queryByLabelText("Add to favorites")).not.toBeInTheDocument();
    });
  });

  describe("focus styling", () => {
    it("applies focused background when focusedCol is -1", () => {
      const { container } = renderChannelRow({ focusedCol: -1 });
      const rowDiv = container.querySelector('[data-guide-row="0"]');
      expect(rowDiv).toBeInTheDocument();
      expect(rowDiv?.className).toContain("bg-muted");
    });

    it("does not apply focused background when focusedCol is not -1", () => {
      const { container } = renderChannelRow({ focusedCol: 1 });
      const rowDiv = container.querySelector('[data-guide-row="0"]');
      expect(rowDiv).toBeInTheDocument();
      expect(rowDiv?.className).not.toContain("bg-muted/20");
    });
  });
});
