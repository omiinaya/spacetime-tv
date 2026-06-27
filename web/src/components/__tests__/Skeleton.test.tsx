import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Skeleton,
  SkeletonLine,
  SkeletonBlock,
  ChannelCardSkeleton,
  PosterCardSkeleton,
  SeriesCardSkeleton,
  TabSkeleton,
} from "../Skeleton";

describe("Skeleton", () => {
  it("renders a div with rounded bg-muted classes", () => {
    const { container } = render(<Skeleton />);
    const div = container.firstChild as HTMLElement;
    expect(div.tagName).toBe("DIV");
    expect(div.className).toContain("rounded");
    expect(div.className).toContain("bg-muted");
  });

  it("applies additional className", () => {
    const { container } = render(<Skeleton className="w-20 h-7" />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("w-20");
    expect(div.className).toContain("h-7");
  });

  it("applies inline style", () => {
    const { container } = render(<Skeleton style={{ width: "50%" }} />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.width).toBe("50%");
  });

  it("has shimmer background animation", () => {
    const { container } = render(<Skeleton />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.animation).toContain("shimmer");
    expect(div.style.backgroundSize).toBe("200% 100%");
  });
});

describe("SkeletonLine", () => {
  it("renders a Skeleton with h-3 class", () => {
    const { container } = render(<SkeletonLine />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("h-3");
    expect(div.className).toContain("rounded");
  });

  it("accepts a custom width via style", () => {
    const { container } = render(<SkeletonLine width="75%" />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.width).toBe("75%");
  });

  it("defaults width to 100%", () => {
    const { container } = render(<SkeletonLine />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.width).toBe("100%");
  });

  it("applies additional className", () => {
    const { container } = render(<SkeletonLine className="mb-2" />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("mb-2");
  });
});

describe("SkeletonBlock", () => {
  it("renders a Skeleton with aspect-square", () => {
    const { container } = render(<SkeletonBlock />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("aspect-square");
  });

  it("applies additional className", () => {
    const { container } = render(<SkeletonBlock className="w-12" />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("aspect-square");
    expect(div.className).toContain("w-12");
  });
});

describe("ChannelCardSkeleton", () => {
  it("renders a card container", () => {
    const { container } = render(<ChannelCardSkeleton />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("bg-card");
    expect(root.className).toContain("rounded-lg");
  });

  it("renders a block skeleton for the channel icon area", () => {
    const { container } = render(<ChannelCardSkeleton />);
    const largeBlock = container.querySelector(".h-12");
    expect(largeBlock).toBeTruthy();
  });

  it("renders a skeleton line for channel name", () => {
    const { container } = render(<ChannelCardSkeleton />);
    const skeletonLines = container.querySelectorAll(".h-3");
    expect(skeletonLines.length).toBe(1);
  });
});

describe("PosterCardSkeleton", () => {
  it("renders a card container with poster aspect ratio", () => {
    const { container } = render(<PosterCardSkeleton />);
    const poster = container.querySelector(".aspect-\\[2\\/3\\]");
    expect(poster).toBeTruthy();
  });

  it("renders two SkeletonLine placeholders (title + subtitle)", () => {
    const { container } = render(<PosterCardSkeleton />);
    const lines = container.querySelectorAll(".h-3");
    expect(lines.length).toBe(2);
  });

  it("has correct first line width (85%)", () => {
    const { container } = render(<PosterCardSkeleton />);
    const lines = container.querySelectorAll<HTMLElement>(".h-3");
    expect(lines[0].style.width).toBe("85%");
  });

  it("has correct second line width (45%)", () => {
    const { container } = render(<PosterCardSkeleton />);
    const lines = container.querySelectorAll<HTMLElement>(".h-3");
    expect(lines[1].style.width).toBe("45%");
  });
});

describe("SeriesCardSkeleton", () => {
  it("renders a card container with poster + metadata + button area", () => {
    const { container } = render(<SeriesCardSkeleton />);
    const poster = container.querySelector(".aspect-\\[2\\/3\\]");
    expect(poster).toBeTruthy();
  });

  it("renders three SkeletonLine placeholders", () => {
    const { container } = render(<SeriesCardSkeleton />);
    const lines = container.querySelectorAll(".h-3");
    expect(lines.length).toBe(2);
  });

  it("renders a button-area skeleton (h-7)", () => {
    const { container } = render(<SeriesCardSkeleton />);
    const btnArea = container.querySelector(".h-7");
    expect(btnArea).toBeTruthy();
  });

  it("has correct first line width (80%)", () => {
    const { container } = render(<SeriesCardSkeleton />);
    const lines = container.querySelectorAll<HTMLElement>(".h-3");
    expect(lines[0].style.width).toBe("80%");
  });

  it("has correct second line width (40%)", () => {
    const { container } = render(<SeriesCardSkeleton />);
    const lines = container.querySelectorAll<HTMLElement>(".h-3");
    expect(lines[1].style.width).toBe("40%");
  });
});

describe("TabSkeleton", () => {
  it("renders a small skeleton tab (w-20 h-7)", () => {
    const { container } = render(<TabSkeleton />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("w-20");
    expect(div.className).toContain("h-7");
    expect(div.className).toContain("shrink-0");
  });
});
