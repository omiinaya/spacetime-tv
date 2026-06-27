import { describe, it, expect } from "vitest";
import { imageUrl, tmdbImageUrl, tmdbSrcset, tmdbImgProps, fetchWithTimeout, fetchWithRetry, api } from "@/lib/api";

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

  it('accepts custom sizes attribute', () => {
    const props = tmdbImgProps('/poster.jpg', 'w342', '100vw');
    expect(props.sizes).toBe('100vw');
  });
});

// ── fetchWithTimeout ─────────────────────────────────────────
describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it('returns response when fetch resolves before timeout', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);
    const res = await fetchWithTimeout('https://test.com/api/data', { timeout: 5000 });
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws AbortError on timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      (_url, options) => new Promise<never>((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      }),
    );
    await expect(
      fetchWithTimeout('https://test.com/api/slow', { timeout: 50 }),
    ).rejects.toThrow('Aborted');
  });

  it('uses custom timeout value', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);
    await fetchWithTimeout('https://test.com/api', { timeout: 100 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts when parent signal is aborted', async () => {
    const abortController = new AbortController();
    const calledSignal = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      (_url, options) => new Promise<never>((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            calledSignal();
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      }),
    );
    setTimeout(() => abortController.abort(), 10);
    await expect(
      fetchWithTimeout('https://test.com/api', { signal: abortController.signal, timeout: 5000 }),
    ).rejects.toThrow('Aborted');
    expect(calledSignal).toHaveBeenCalledTimes(1);
  });
});

// ── fetchWithRetry ──────────────────────────────────────────
describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('succeeds on first attempt', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);
    const res = await fetchWithRetry('https://test.com/api', { retries: 1 });
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on TypeError and succeeds on second attempt', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce(mockResponse);
    const res = await fetchWithRetry('https://test.com/api', { retries: 1 });
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on AbortError and succeeds on second attempt', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      .mockResolvedValueOnce(mockResponse);
    const res = await fetchWithRetry('https://test.com/api', { retries: 1 });
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry on HTTP error (non-ok response)', async () => {
    const mockResponse = new Response('Not Found', { status: 404 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);
    // fetchWithRetry only retries on network errors (TypeError / AbortError);
    // a 404 is a successful fetch with a non-ok response, so it returns the
    // response and the caller (get<T>) throws based on !res.ok
    const res = await fetchWithRetry('https://test.com/api', { retries: 1 });
    expect(res.status).toBe(404);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('exhausts all retries and throws last error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Network error 1'))
      .mockRejectedValueOnce(new TypeError('Network error 2'));
    await expect(
      fetchWithRetry('https://test.com/api', { retries: 1 }),
    ).rejects.toThrow('Network error 2');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-retryable error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(Object.assign(new Error('Syntax error'), { name: 'SyntaxError' }));
    await expect(
      fetchWithRetry('https://test.com/api', { retries: 1 }),
    ).rejects.toThrow('Syntax error');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

// ── API object integration ──────────────────────────────────
describe('api object', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('api.live.categories() returns parsed JSON on success', async () => {
    const data = { categories: [{ category_id: '1', category_name: 'News', parent_id: 0 }] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await api.live.categories();
    expect(result).toEqual(data);
  });

  it('api.live.streams() passes category_id param', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ streams: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    await api.live.streams('5');
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain('/api/live/streams?category_id=5');
  });

  it('api.movies.list() returns paginated results', async () => {
    const data = { movies: [{ name: 'Test' }], total: 1, offset: 0, limit: 20 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await api.movies.list('1', 10, 0);
    expect(result.movies).toHaveLength(1);
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404 }),
    );
    await expect(api.live.categories()).rejects.toThrow('API error 404');
  });

  it('search returns combined results', async () => {
    const data = { live: [], movies: [], series: [], totals: { live: 0, movies: 0, series: 0 } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await api.search('test query');
    expect(result.totals).toBeDefined();
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent('test query'));
  });

  it('searchEnrich uses POST method', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    await api.searchEnrich([{ stream_id: 1, tmdb_id: '550' }], []);
    const calledOptions = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.body).toContain('tmdb_id');
  });

  it('watchlist.progress() returns progress record', async () => {
    const data = { progress: {} };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await api.watchlist.progress();
    expect(result).toEqual(data);
  });
});
