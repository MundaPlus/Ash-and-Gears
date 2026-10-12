import { expect, test } from "@playwright/test";

test("a heater shows its target and how hard it works; the target can be changed; a vent and clothes draw", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?seed=e2e-climate");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  // A hut left-up of home: heater and generator inside, a vent in the east wall, clothes on the floor.
  const at = await page.evaluate(() => {
    const g = (window as any).__game;
    g.pause();
    const game = g.game;
    const { x, y } = game.home;
    const L = game.map.layers[0];
    const x0 = x - 12, y0 = y - 10;
    for (let ty = y0 - 1; ty <= y0 + 7; ty++)
      for (let tx = x0 - 1; tx <= x0 + 7; tx++) {
        const th = L.thing[L.i(tx, ty)];
        if (th !== -1) game.removeThing(th);
        game.setTerrain(0, tx, ty, "dirt");
      }
    for (let ty = y0; ty <= y0 + 6; ty++)
      for (let tx = x0; tx <= x0 + 6; tx++)
        if (tx === x0 || ty === y0 || tx === x0 + 6 || ty === y0 + 6) game.spawnThing(tx === x0 + 6 && ty === y0 + 3 ? "vent" : "stone_wall", 0, tx, ty);
    const h = game.spawnThing("electric_heater", 0, x0 + 2, y0 + 2);
    const gen = game.spawnThing("scrap_generator", 0, x0 + 3, y0 + 2);
    gen.fuel = 30;
    g.sim.dropItems(game, "warm_coat", 1, 0, x0 + 2, y0 + 4);
    g.sim.dropItems(game, "patched_clothes", 1, 0, x0 + 3, y0 + 4);
    game.tick = game.ticksPerDay * game.opts.seasonDays * 3;
    g.runTicks(600);
    g.camera.zoom = 1.5;
    return { x: x0 + 2, y: y0 + 2, cx: x0 + 3, cy: y0 + 3, id: h.id };
  });
  const p = await page.evaluate(([tx, ty]) => {
    const g = (window as any).__game;
    const c = g.camera;
    c.centerOn(tx * 32 + 16, ty * 32 + 16 + 120);
    const r = g.app.canvas.getBoundingClientRect();
    return { x: r.left + (tx * 32 + 16 - c.x) * c.zoom + c.viewW / 2, y: r.top + (ty * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
  }, [at.x, at.y]);
  await page.mouse.click(p.x, p.y);
  const panel = page.getByTestId("climate");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("target")).toHaveText("21 °C");
  await expect(panel).toContainText("%");
  await page.getByTestId("target+5").click();
  await expect(page.getByTestId("target")).toHaveText("26 °C");
  expect(await page.evaluate((id) => (window as any).__game.game.things.get(id).target, at.id)).toBe(26);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-climate.png` });
  expect(errors).toEqual([]);
});
