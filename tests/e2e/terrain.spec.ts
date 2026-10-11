import { expect, test } from "@playwright/test";

test("mineable rock looks unlike asphalt, and tower floors show the ground below", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-terrain");
  for (const style of ["print", "pixel"]) {
    await page.goto(`/?seed=e2e-terrain&style=${style}`);
    await page.waitForFunction(() => (window as any).__game?.ready === true);
    const upper = await page.evaluate(() => {
      const g = (window as any).__game;
      g.pause();
      const game = g.game,
        L = game.map.layers[0],
        reg = game.reg.terrain;
      const rock = reg.idx("rock"),
        asphalt = reg.idx("asphalt");
      // A strip of asphalt next to a rock patch, so both show in one picture.
      let at = { x: 0, y: 0 };
      for (let i = 0; i < L.terrain.length; i++)
        if (L.terrain[i] === rock) {
          at = { x: i % L.w, y: Math.floor(i / L.w) };
          break;
        }
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -6; dx <= -1; dx++) {
          const x = at.x + dx,
            y = at.y + dy;
          if (!L.inBounds(x, y) || L.terrain[L.i(x, y)] === rock) continue;
          L.terrain[L.i(x, y)] = asphalt;
          L.touch(x, y);
        }
      g.camera.zoom = 1.5;
      g.camera.centerOn(at.x * 32, at.y * 32);
      return game.map.layerAt(1);
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `artifacts/screens/terrain-rock-${style}-${info.project.name}.png` });
    // Go up one floor: the surface stays drawn under the open air.
    await page.evaluate((l) => (window as any).__game.setLayer(l), upper);
    await page.waitForTimeout(300);
    const shown = await page.evaluate(
      () => (window as any).__game.renderer.layerRoots.filter((r: any) => r.visible).length,
    );
    await page.screenshot({ path: `artifacts/screens/terrain-upper-${style}-${info.project.name}.png` });
    expect(shown).toBe(2);
  }
  expect(errors).toEqual([]);
});
