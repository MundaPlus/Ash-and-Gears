import { expect, test } from "@playwright/test";

test("wires and pipes run through walls and draw across them", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-wallline");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.pause();
    const game = g.game, L = game.map.layers[0];
    const x0 = game.home.x - 8, y0 = game.home.y + 6;
    for (let y = y0 - 1; y <= y0 + 6; y++)
      for (let x = x0 - 1; x <= x0 + 10; x++) {
        const t = L.thing[L.i(x, y)];
        if (t !== -1) game.removeThing(t);
        game.setTerrain(0, x, y, "dirt");
      }
    // A wall line down the middle; a wire crosses it on row 1, a pipe on row 3.
    for (let y = y0; y <= y0 + 4; y++) game.spawnThing("scrap_wall", 0, x0 + 4, y);
    for (const [row, line] of [[1, "wire"], [3, "pipe"]] as const) {
      for (let x = x0 + 1; x <= x0 + 7; x++) if (x !== x0 + 4) game.spawnThing(line, 0, x, y0 + row);
      game.things.get(L.thing[L.i(x0 + 4, y0 + row)]).line = line;
      L.touch(x0 + 4, y0 + row);
    }
    g.camera.zoom = 2;
    g.camera.centerOn((x0 + 4) * 32, (y0 + 2) * 32);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `artifacts/screens/wall-lines-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
