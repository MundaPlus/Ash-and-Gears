import { expect, test } from "@playwright/test";

test("prisoner and medical bed covers turn with the bed", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-beds");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.pause();
    const game = g.game, L = game.map.layers[0];
    const x0 = game.home.x - 8, y0 = game.home.y + 6;
    // Clear a field, then lay out the beds: one row per kind, one column per turn.
    for (let y = y0 - 1; y <= y0 + 7; y++)
      for (let x = x0 - 1; x <= x0 + 12; x++) {
        const t = L.thing[L.i(x, y)];
        if (t !== -1) game.removeThing(t);
        game.setTerrain(0, x, y, "dirt");
      }
    for (const [row, kind] of [[0, "prison"], [4, "medical"]] as const)
      for (let rot = 0; rot < 4; rot++) {
        const b = game.spawnThing("bedroll", 0, x0 + rot * 3, y0 + row, rot);
        if (kind === "prison") b.forPrisoners = true;
        else b.medical = true;
      }
    g.camera.zoom = 2;
    g.camera.centerOn((x0 + 5) * 32, (y0 + 3) * 32);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `artifacts/screens/beds-turned-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
