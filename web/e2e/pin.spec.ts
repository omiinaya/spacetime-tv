/**
 * Parental Controls PIN flow E2E tests.
 *
 * Covers the full deterministic lifecycle in Settings:
 *   - Set a PIN (New PIN + Confirm, "Set PIN" button)
 *   - "PIN set" badge appears
 *   - Toggling adult content with a PIN configured prompts for the PIN
 *   - Entering the correct PIN unlocks adult content ("Adult content is
 *     visible" + "Lock again")
 *   - Wrong PIN is rejected ("Incorrect PIN. Try again.")
 *   - "Lock again" re-gates adult content
 *   - Remove PIN (via dialog confirm) returns to PIN-less state
 *
 * Deterministic: fresh localStorage per run, PIN hashing via real Web
 * Crypto in the browser (no live stream needed).
 *
 * Prerequisites:
 *   - Backend API running on :8720 (also serves the frontend)
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const PIN = "1234";
const WRONG_PIN = "9999";

test.beforeEach(async ({ page }) => {
  // Suppress the iOS PWA "Install Spacetime-TV" prompt: it appears ~5s after
  // load on iPad/iPhone and its bottom overlay can intercept interactions
  // with the toggles. Seed the dismiss flag so it never shows.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("stv_pwa_dismissed", String(Date.now()));
    } catch {
      /* storage quota */
    }
  });
});

async function setPin(page: import("@playwright/test").Page) {
  await page.getByPlaceholder("New PIN (4+ digits)").fill(PIN);
  await page.getByPlaceholder("Confirm PIN").fill(PIN);
  await page.getByText("Set PIN", { exact: true }).click();
}

/** Click the adult-content toggle switch — it's a <button> whose accessible
 * name is the current state text ("Adult content is hidden"/"visible"). */
async function clickAdultToggle(page: import("@playwright/test").Page) {
  const toggle = page
    .getByRole("button", { name: /adult content is (hidden|visible)/i })
    .first();
  await toggle.click();
}

/** The PIN prompt dialog's descriptive text. */
const PROMPT_TEXT = "Enter your PIN to show adult content.";

/**
 * Enter a 4-digit PIN by keyboard. The dialog's keydown handler lives on the
 * numpad grid container (no visible input exists — inputRef is declared but
 * never rendered). Focusing the first numpad button makes digit keydowns
 * bubble to that handler. Typing is more robust across engines than clicking
 * numpad buttons (which can be intercepted by the iOS install-app prompt or
 * match stray digits elsewhere on the page).
 */
async function enterPin(page: import("@playwright/test").Page, pin: string) {
  const dialog = page.getByRole("dialog", { name: "Unlock Adult Content" });
  await dialog.waitFor({ state: "visible" });
  // Focus the first numpad button (keydown bubbles to the grid handler).
  await dialog.getByRole("button").first().focus();
  await page.keyboard.type(pin);
}

test.describe("Parental Controls PIN", () => {
  test("set a PIN shows the PIN set badge", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2500);

    // Scroll to Parental Controls if needed
    await page.getByText("Parental Controls").scrollIntoViewIfNeeded();
    await setPin(page);

    await expect(page.getByText("PIN set")).toBeVisible({ timeout: 5_000 });
    console.log("PIN set badge visible");
  });

  test("adult toggle prompts for PIN when configured", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2500);
    await page.getByText("Parental Controls").scrollIntoViewIfNeeded();
    await setPin(page);
    await expect(page.getByText("PIN set")).toBeVisible({ timeout: 5_000 });

    // Click the adult toggle switch
    await clickAdultToggle(page);
    const prompt = page.getByText(PROMPT_TEXT);
    await expect(prompt).toBeVisible({ timeout: 5_000 });
    console.log("Adult toggle prompt for PIN");
  });

  test("correct PIN unlocks adult content", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2500);
    await page.getByText("Parental Controls").scrollIntoViewIfNeeded();
    await setPin(page);
    await expect(page.getByText("PIN set")).toBeVisible({ timeout: 5_000 });

    // Toggle + enter correct PIN via numpad
    await clickAdultToggle(page);
    await expect(
      page.getByText(PROMPT_TEXT),
    ).toBeVisible({ timeout: 5_000 });
    await enterPin(page, PIN);

    await expect(page.getByText("Adult content is visible")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Lock again")).toBeVisible({ timeout: 5_000 });
    console.log("Correct PIN unlocked adult content");
  });

  test("wrong PIN is rejected", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2500);
    await page.getByText("Parental Controls").scrollIntoViewIfNeeded();
    await setPin(page);
    await expect(page.getByText("PIN set")).toBeVisible({ timeout: 5_000 });

    await clickAdultToggle(page);
    await expect(
      page.getByText(PROMPT_TEXT),
    ).toBeVisible({ timeout: 5_000 });
    await enterPin(page, WRONG_PIN);

    await expect(page.getByText("Incorrect PIN. Try again.")).toBeVisible({
      timeout: 5_000,
    });
    // Still gated
    await expect(page.getByText("Adult content is hidden")).toBeVisible();
    console.log("Wrong PIN rejected, adult still hidden");
  });

  test("Lock again re-gates adult content", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2500);
    await page.getByText("Parental Controls").scrollIntoViewIfNeeded();
    await setPin(page);
    await expect(page.getByText("PIN set")).toBeVisible({ timeout: 5_000 });

    // Unlock
    await clickAdultToggle(page);
    await expect(
      page.getByText(PROMPT_TEXT),
    ).toBeVisible({ timeout: 5_000 });
    await enterPin(page, PIN);
    await expect(page.getByText("Adult content is visible")).toBeVisible({
      timeout: 5_000,
    });

    // Lock again → the session re-arms the PIN gate. The visible adult text
    // is engine-dependent: "Lock again" is a button inside the <label>, and
    // Safari's label activation also hides adult content (chromium's
    // stopPropagation prevents it). Assert only the invariant: the "Lock
    // again" button disappears and toggling adult on now requires the PIN.
    await page.getByText("Lock again").click();
    await expect(page.getByText("Lock again")).not.toBeVisible({
      timeout: 5_000,
    });

    // Toggle until the PIN prompt appears (1 click when the label hid adult
    // content on Safari, 2 clicks when it stayed visible on chromium).
    const prompt = page.getByText(PROMPT_TEXT);
    for (let i = 0; i < 2 && !(await prompt.isVisible().catch(() => false)); i++) {
      await clickAdultToggle(page);
    }
    await expect(prompt).toBeVisible({ timeout: 5_000 });
    console.log("Lock again re-gated adult content (PIN required again)");
  });

  test("remove PIN returns to PIN-less state", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2500);
    await page.getByText("Parental Controls").scrollIntoViewIfNeeded();
    await setPin(page);
    await expect(page.getByText("PIN set")).toBeVisible({ timeout: 5_000 });

    // Handle the confirm() dialog and click Remove PIN
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByText("Remove PIN", { exact: true }).click();

    await expect(page.getByText("PIN set")).not.toBeVisible({ timeout: 5_000 });
    // Without a PIN, toggling adult content no longer prompts
    await clickAdultToggle(page);
    await expect(page.getByText("Adult content is visible")).toBeVisible({
      timeout: 5_000,
    });
    console.log("Remove PIN returned to PIN-less state");
  });
});