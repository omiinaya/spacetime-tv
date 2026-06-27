/**
 * MSW test server for Vitest/jsdom environment.
 *
 * Start/stop/reset in test setup so all tests exercise the real api.ts module
 * with network-level interception via MSW handlers.
 *
 * ── Usage ─────────────────────────────────────────────────────────
 *
 *   // In src/test-setup.ts:
 *   import { server } from "@/mocks/server";
 *   beforeAll(() => server.listen());
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 *
 *   // In an individual test file, add/adjust handlers as needed:
 *   import { server } from "@/mocks/server";
 *   import { http, HttpResponse } from "msw";
 *   server.use(
 *     http.get("/api/series/categories", () =>
 *       HttpResponse.json({ categories: [{ category_id: "1", category_name: "Custom", parent_id: 0 }] }),
 *     ),
 *   );
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
