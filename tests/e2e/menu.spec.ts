import { expect, test } from "@playwright/test";

test("title screen, new game, save and load", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await page.getByTestId("new-game-btn").click();
  await expect(page.getByTestId("new-game")).toBeVisible();
  await page.locator("#ng-seed").fill("menu-test");
  await page.getByTestId("start-game").click();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  expect(await page.evaluate(() => (window as any).__game.game.opts.seed)).toBe("menu-test");
  // Goals: a side panel on desktop, inside the menu on phones.
  if (info.project.name === "desktop") await expect(page.getByTestId("goals")).toBeVisible();

  // Play a bit, then save from the menu.
  await page.evaluate(() => (window as any).__game.runTicks(3000));
  const tick = await page.evaluate(() => (window as any).__game.game.tick);
  await page.getByTestId("menu-btn").click();
  await expect(page.getByTestId("game-menu")).toBeVisible();
  await page.getByTestId("save-now").click();
  await expect(page.getByTestId("game-menu")).toContainText("Saved:");

  // Palette switch works live.
  await page.getByText("Settings").click();
  await page.getByTestId("palette-toxic").click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wc-art") ?? "{}").palette)).toBe("toxic");

  // Load the save: the game comes back at the saved tick.
  await page.getByText("Save & load").click();
  await page.locator('[data-testid^="slot-save-"]').first().click();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const loaded = await page.evaluate(() => (window as any).__game.game.tick);
  expect(loaded).toBeGreaterThanOrEqual(tick);
  expect(loaded).toBeLessThan(tick + 400);
  // A loaded game starts paused: the clock does not move.
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as any).__game.game.tick)).toBe(loaded);
  expect(errors).toEqual([]);
});
