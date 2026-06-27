import { describe, it, expect } from "vitest";
import { imageUrl, tmdbImageUrl, tmdbSrcset, tmdbImgProps } from "@/lib/api";

describe("imageUrl", () => {
  it("returns empty for empty input", () => {
    expect(imageUrl("")).toBe("");
  });

  it("passes through valid HTTPS URLs from non-cmc domains", () => {
    const url = "https://image.tmdb.org/t/p/w600/abc123.jpg";
    expect(imageUrl(url)).toBe(url);
  });

  it("proxies CMC CDN URLs", () => {
    const url = "https://cmc.exchange-cdn.com/poster/abc.jpg";
    const result = imageUrl(url);
    expect(result).toContain("/api/image-proxy?url=");
    expect(result).toContain(encodeURIComponent(url));
  });

  it("fixes concatenated TMDB URLs", () => {
    const bad =
      "image.tmdb.https//image.tmdb.org/t/p/original/X.jpgorghttps//image.tmdb.org/t/p/w600/Y.jpg";
    const result = imageUrl(bad);
    expect(result).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/original\/X\.jpg$/);
  });

  it("handles URLs missing colon after https", () => {
    const url = "https//image.tmdb.org/t/p/w600/test.png";
    const result = imageUrl(url);
    expect(result).toBe("https://image.tmdb.org/t/p/w600/test.png");
  });
});

describe("tmdbImageUrl", () => {
  it("returns empty for empty path", () => {
    expect(tmdbImageUrl("")).toBe("");
  });

  it("builds URL with leading slash", () => {
    expect(tmdbImageUrl("/abc123.jpg")).toBe("https://image.tmdb.org/t/p/w342/abc123.jpg");
  });

  it("builds URL without leading slash", () => {
    expect(tmdbImageUrl("abc123.jpg")).toBe("https://image.tmdb.org/t/p/w342/abc123.jpg");
  });

  it("uses custom size", () => {
    expect(tmdbImageUrl("/abc.jpg", "original")).toBe("https://image.tmdb.org/t/p/original/abc.jpg");
  });

  it("passes through full URLs", () => {
    expect(tmdbImageUrl("https://cdn.example.com/poster.jpg")).toBe("https://cdn.example.com/poster.jpg");
  });
});

describe("tmdbSrcset", () => {
  it("returns empty for empty path", () => {
    expect(tmdbSrcset("")).toBe("");
  });

  it("generates srcset with 6 sizes", () => {
    const result = tmdbSrcset("/abc.jpg");
    expect(result).toContain("w92");
    expect(result).toContain("w154");
    expect(result).toContain("w185");
    expect(result).toContain("w342");
    expect(result).toContain("w500");
    expect(result).toContain("w780");
  });

  it("includes width descriptors", () => {
    const result = tmdbSrcset("/abc.jpg");
    expect(result).toContain("92w");
    expect(result).toContain("780w");
  });

  it("handles path without leading slash", () => {
    const result = tmdbSrcset("abc.jpg");
    expect(result).toContain("/abc.jpg");
  });

  it("generates comma-separated entries", () => {
    const result = tmdbSrcset("/abc.jpg");
    const entries = result.split(", ");
    expect(entries).toHaveLength(6);
  });
});

describe("tmdbImgProps", () => {
  it("returns src, srcset, sizes, and loading=lazy", () => {
    const props = tmdbImgProps("/poster.jpg");
    expect(props.src).toBe("https://image.tmdb.org/t/p/w342/poster.jpg");
    expect(props.srcset).toContain("w92");
    expect(props.sizes).toBeTruthy();
    expect(props.loading).toBe("lazy");
  });

  it("accepts custom default size", () => {
    const props = tmdbImgProps("/poster.jpg", "w185");
    expect(props.src).toBe("https://image.tmdb.org/t/p/w185/poster.jpg");
  });

  it("accepts custom sizes attribute", () => {
    const props = tmdbImgProps("/poster.jpg", "w342", "100vw");
    expect(props.sizes).toBe("100vw");
  });
});
