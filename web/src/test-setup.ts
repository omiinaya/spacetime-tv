import "@testing-library/jest-dom/vitest";
import { beforeAll, afterAll, afterEach } from "vitest";
import { server } from "@/mocks/server";

// Start MSW server before all tests — intercepts fetch() at network level.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));

// Reset any per-test request handlers after each test.
afterEach(() => server.resetHandlers());

// Clean up after all tests.
afterAll(() => server.close());
