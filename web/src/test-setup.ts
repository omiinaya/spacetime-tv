import "@testing-library/jest-dom/vitest";
import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { server } from "@/mocks/server";

// Mock ResizeObserver for jsdom (used by useGridKeyboardNav et al.)
vi.stubGlobal("ResizeObserver", function MockResizeObserver() {
  this.observe = vi.fn();
  this.unobserve = vi.fn();
  this.disconnect = vi.fn();
});

// Mock scrollIntoView (missing in jsdom)
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.scrollBy = vi.fn();

// Start MSW server before all tests — intercepts fetch() at network level.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));

// Reset any per-test request handlers after each test.
afterEach(() => server.resetHandlers());

// Clean up after all tests.
afterAll(() => server.close());
