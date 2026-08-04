/**
 * Tests for the image/URL helper functions in lib/api.ts.
 *
 * These are pure string transforms used across cards, rows, and overlays —
 * covered only transitively elsewhere, so the edge branches (full URLs,
 * leading-slash paths, proxied CDN hosts, empty inputs) are tested here.
 */
import { describe, it, expect } from "vitest";
import {
  imageUrl,
  tmdbImageUrl,
  tmdbSrcset,
  channelIconUrl,
  tmdbImgProps,
} from "@/lib/api";

describe("imageUrl", () => {
  it("returns empty string for empty input", () => {
    expect(imageUrl("")).toBe("");
  });

  it("returns a tmdb path with protocol normalized", () => {
    expect(imageUrl("https://image.tmdb.org/t/p/w342/abc.jpg")).toContain(
      "https://image.tmdb.org/t/p/w342/abc.jpg",
    );
  });

  it("proxies cmc.exchange-cdn.com hosts through the image proxy", () => {
    const out = imageUrl("https://cmc.exchange-cdn.com/img/foo.png");
    expect(out).toContain("/api/image-proxy?url=");
    expect(out).toContain(
      encodeURIComponent("https://cmc.exchange-cdn.com/img/foo.png"),
    );
  });

  it("proxies photo-tmdb.com hosts through the image proxy", () => {
    const out = imageUrl("https://photo-tmdb.com/bar.jpg");
    expect(out).toContain("/api/image-proxy?url=");
  });

  it("passes through arbitrary URLs unchanged", () => {
    expect(imageUrl("https://cdn.example.com/x.png")).toBe(
      "https://cdn.example.com/x.png",
    );
  });
});

describe("tmdbImageUrl", () => {
  it("returns empty string for empty path", () => {
    expect(tmdbImageUrl("")).toBe("");
  });

  it("returns full http URLs as-is", () => {
    expect(tmdbImageUrl("https://cdn.example.com/poster.jpg")).toBe(
      "https://cdn.example.com/poster.jpg",
    );
  });

  it("prefixes a leading-slash path", () => {
    expect(tmdbImageUrl("/abc123.jpg")).toBe(
      "https://image.tmdb.org/t/p/w342/abc123.jpg",
    );
  });

  it("prefixes a bare path", () => {
    expect(tmdbImageUrl("abc123.jpg")).toBe(
      "https://image.tmdb.org/t/p/w342/abc123.jpg",
    );
  });

  it("honors a custom size", () => {
    expect(tmdbImageUrl("/abc.jpg", "w500")).toBe(
      "https://image.tmdb.org/t/p/w500/abc.jpg",
    );
  });
});

describe("tmdbSrcset", () => {
  it("returns empty for empty path", () => {
    expect(tmdbSrcset("")).toBe("");
  });

  it("generates all six poster sizes with width descriptors", () => {
    const srcset = tmdbSrcset("/abc.jpg");
    expect(srcset).toContain("w92/abc.jpg 92w");
    expect(srcset).toContain("w154/abc.jpg 154w");
    expect(srcset).toContain("w185/abc.jpg 185w");
    expect(srcset).toContain("w342/abc.jpg 342w");
    expect(srcset).toContain("w500/abc.jpg 500w");
    expect(srcset).toContain("w780/abc.jpg 780w");
  });

  it("normalizes a bare path to a leading slash", () => {
    expect(tmdbSrcset("abc.jpg")).toContain("w92/abc.jpg");
  });
});

describe("channelIconUrl", () => {
  it("returns empty for empty input", () => {
    expect(channelIconUrl("")).toBe("");
  });

  it("strips http scheme and proxies through /api/iptv/", () => {
    expect(channelIconUrl("http://cdn.example.com/icons/bbc.png")).toBe(
      "/api/iptv/cdn.example.com/icons/bbc.png",
    );
  });

  it("strips https scheme too", () => {
    expect(channelIconUrl("https://cdn.example.com/icons/cnn.png")).toBe(
      "/api/iptv/cdn.example.com/icons/cnn.png",
    );
  });
});

describe("tmdbImgProps", () => {
  it("returns src, srcSet, sizes, and lazy loading", () => {
    const props = tmdbImgProps("/abc.jpg");
    expect(props.src).toBe("https://image.tmdb.org/t/p/w342/abc.jpg");
    expect(props.srcSet).toContain("w92/abc.jpg 92w");
    expect(props.sizes).toContain("500px");
    expect(props.loading).toBe("lazy");
  });

  it("honors a custom default size", () => {
    const props = tmdbImgProps("/abc.jpg", "w780");
    expect(props.src).toBe("https://image.tmdb.org/t/p/w780/abc.jpg");
  });
});
