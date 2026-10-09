import { expect, test } from "@playwright/test";

test("game boots, renders, runs and switches layers", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/?seed=e2e");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator("#game canvas")).toBeVisible();

  // Time advances while unpaused.
  const t0 = await page.evaluate(() => (window as any).__game.game.tick);
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(() => (window as any).__game.game.tick);
  expect(t1).toBeGreaterThan(t0);

  await page.screenshot({ path: `artifacts/screens/${info.project.name}-surface.png` });

  // Zoomed-out overview.
  await page.evaluate(() => ((window as any).__game.camera.zoom = 0.2));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-overview.png` });
  await page.evaluate(() => ((window as any).__game.camera.zoom = 1));

  // Underground layer via the HUD button.
  await page.getByTestId("layer-down").click();
  await expect(page.getByTestId("layer-name")).toHaveText("Underground");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-underground.png` });

  // Tap a tile to inspect it.
  const box = (await page.locator("#game canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("inspect")).toBeVisible();

  expect(errors).toEqual([]);
});
