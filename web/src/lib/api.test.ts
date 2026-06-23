import { describe, it, expect } from "vitest";
import { imageUrl } from "@/lib/api";

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
