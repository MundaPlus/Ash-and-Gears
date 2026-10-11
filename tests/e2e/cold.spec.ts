import { expect, test } from "@playwright/test";

test("a crop in the cold says it does not grow; the calendar shows the temperature", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-cold");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const at = await page.evaluate(() => {
    const g = (window as any).__game, game = g.game, L = game.map.layers[0];
    g.pause();
    const x = game.home.x + 6, y = game.home.y + 4;
    const th = L.thing[L.i(x, y)];
    if (th !== -1) game.removeThing(th);
    game.setTerrain(0, x, y, "dirt");
    game.spawnThing("glowcorn_plant", 0, x, y).growth = 0.4;
    // Make it too cold for glowcorn here: it needs more warmth than any spring day has.
    game.reg.things.get("glowcorn_plant").crop.minTemp = 60;
    g.camera.zoom = 1.5;
    g.camera.centerOn(x * 32, y * 32);
    const c = g.camera, r = g.app.canvas.getBoundingClientRect();
    return { x: r.left + (x * 32 + 16 - c.x) * c.zoom + c.viewW / 2, y: r.top + (y * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
  });
  await page.mouse.click(at.x, at.y);
  const box = page.getByTestId("inspect");
  await expect(box).toContainText("Too cold for Glowcorn");
  await expect(box).toContainText("Outdoors,");
  await expect(page.locator(".clock, .time, [data-testid=clock]").first()).toContainText("°C");
  await page.screenshot({ path: `artifacts/screens/cold-crop-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
