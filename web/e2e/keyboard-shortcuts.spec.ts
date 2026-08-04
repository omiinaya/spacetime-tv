/**
 * Keyboard Shortcuts E2E tests — the "?" help overlay.
 *
 * Covers: pressing "?" opens the Keyboard Shortcuts dialog, it lists
 * Global + Player shortcuts, Escape closes it, and navigation shortcuts
 * (g → /guide) work from a plain page.
 *
 * Deterministic — no live stream needed. Gated from input fields, so all
 * presses happen while no input is focused.
 *
 * Prerequisites:
 *   - Backend API running on :8720 (also serves the frontend)
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

test.describe("Keyboard Shortcuts", () => {
  test("pressing ? opens the shortcuts overlay", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    // Ensure no input is focused
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard Shortcuts" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    console.log("Shortcuts overlay opened with ?");
  });

  test("overlay lists Global and Player shortcut categories", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard Shortcuts" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const text = await dialog.innerText();
    expect(text).toContain("GLOBAL");
    expect(text).toContain("PLAYER");
    // A few canonical shortcuts should be documented
    expect(text).toContain("Go to TV Guide");
    expect(text).toContain("Play / Pause");
    expect(text).toContain("Toggle fullscreen");
    console.log("Shortcut categories + entries listed");
  });

  test("Escape closes the shortcuts overlay", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard Shortcuts" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    console.log("Escape closed the shortcuts overlay");
  });

  test("g shortcut navigates to the TV guide", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

    await page.keyboard.press("g");
    await page.waitForTimeout(2500);
    expect(page.url()).toContain("/guide");
    console.log("g navigated to /guide");
  });

  test("h shortcut navigates home", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

    await page.keyboard.press("h");
    await page.waitForTimeout(2000);
    const u = new URL(page.url());
    expect(u.pathname === "/" || u.pathname === "").toBeTruthy();
    console.log("h navigated home");
  });

  test("shortcuts are gated when an input is focused", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    // Focus the search input — typing 'g' should type, not navigate
    const input = page.locator("input[type='text'], input:not([type])").first();
    await input.focus();
    await page.keyboard.press("g");
    await page.waitForTimeout(1500);
    // Still on search, not guide
    expect(page.url()).toContain("/search");

    // Blur and now 'g' navigates
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
    await page.keyboard.press("g");
    await page.waitForTimeout(2500);
    expect(page.url()).toContain("/guide");
    console.log("Shortcut gating respected (input focus blocks navigation)");
  });
});
