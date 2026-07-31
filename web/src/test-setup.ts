import "@testing-library/jest-dom/vitest";
import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { configure } from "@testing-library/react";
import { server } from "@/mocks/server";

// Testing Library's waitFor/findBy* default to a 1000ms timeout. Under full
// parallel-suite CPU contention that is too tight and causes rotating flaky
// failures (LiveTV/Search/Series/SeriesOverlay/PlayerCenterControls). Raise
// the default so async assertions get the same headroom as testTimeout.
configure({ asyncUtilTimeout: 4000 });

// Mock ResizeObserver for jsdom (used by useGridKeyboardNav et al.)
vi.stubGlobal("ResizeObserver", function MockResizeObserver(
  this: Record<string, ReturnType<typeof vi.fn>>,
) {
  this.observe = vi.fn();
  this.unobserve = vi.fn();
  this.disconnect = vi.fn();
} as unknown as typeof ResizeObserver);

// Mock scrollIntoView (missing in jsdom)
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.scrollBy = vi.fn();

// Mock IntersectionObserver (missing in jsdom)
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
});
vi.stubGlobal("IntersectionObserver", mockIntersectionObserver);

// Start MSW server before all tests — intercepts fetch() at network level.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));

// Reset any per-test request handlers after each test.
afterEach(() => server.resetHandlers());

// Clean up after all tests.
afterAll(() => server.close());
