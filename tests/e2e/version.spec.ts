import { expect, test } from "@playwright/test";

test("a new build on the server: the game says so, saves and reloads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-version");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  // The server now says a newer build is out.
  await page.route("**/version.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "newer" }) }));
  const reloaded = page.waitForEvent("load");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("A new version of the game is out")).toBeVisible();
  await reloaded;
  await page.unroute("**/version.json");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  expect(errors).toEqual([]);
});
