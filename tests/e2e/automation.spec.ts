import { expect, test } from "@playwright/test";

test("research, power, belts and lamp light", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?seed=e2e-auto");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.pause());

  // Research panel: pick a project.
  await page.getByTestId("tb-research").click();
  await expect(page.getByTestId("research-panel")).toBeVisible();
  await page.getByTestId("research-scrap_power").click();
  expect(await page.evaluate(() => (window as any).__game.game.research.current)).toBe("scrap_power");

  // Locked build item shows the research it needs; unlocking enables it.
  await page.getByTestId("tb-build").click();
  await expect(page.getByTestId("build-scrap_generator")).toBeDisabled();
  await page.evaluate(() => {
    const g = (window as any).__game;
    for (const r of ["scrap_power", "electric_lights", "powered_tools", "conveyors", "batteries"]) g.game.research.done.add(r);
  });
  await page.getByTestId("tb-build").click();
  await page.getByTestId("tb-build").click();
  await expect(page.getByTestId("build-scrap_generator")).toBeEnabled();

  // Place a belt facing south using Q (counter-clockwise from east = north) twice... use E once: east -> south.
  await page.getByTestId("build-conveyor").click();
  await page.keyboard.press("e");
  const spot = await page.evaluate(() => {
    const g = (window as any).__game;
    const { x, y } = g.game.home;
    g.camera.zoom = 1.2;
    g.camera.centerOn((x - 4) * 32, (y - 4) * 32);
    g.camera.update(0);
    const c = g.camera;
    const r = g.app.canvas.getBoundingClientRect();
    const sx = (tx: number) => r.left + (tx * 32 + 16 - c.x) * c.zoom + c.viewW / 2;
    const sy = (ty: number) => r.top + (ty * 32 + 16 - c.y) * c.zoom + c.viewH / 2;
    return { x: sx(x - 4), y: sy(y - 4), tx: x - 4, ty: y - 4 };
  });
  await page.mouse.click(spot.x, spot.y);
  const rot = await page.evaluate(([tx, ty]) => {
    const g = (window as any).__game.game;
    const L = g.map.layers[0];
    const bp = g.blueprints.get(L.blueprint[L.i(tx, ty)]);
    return bp?.rot;
  }, [spot.tx, spot.ty]);
  expect(rot).toBe(1);
  await page.keyboard.press("Escape");

  // A powered lamp at night: generator + wire + lamp spawned directly, then jump to 22:00.
  await page.evaluate(() => {
    const g = (window as any).__game;
    const game = g.game;
    const { x, y } = game.home;
    const clear = (tx: number, ty: number) => {
      const L = game.map.layers[0];
      const th = L.thing[L.i(tx, ty)];
      if (th !== -1) game.removeThing(th);
    };
    for (let i = 0; i < 3; i++) clear(x + 3 + i, y - 3);
    const gen = game.spawnThing("scrap_generator", 0, x + 3, y - 3);
    gen.fuel = 30;
    game.spawnThing("wire", 0, x + 4, y - 3);
    game.spawnThing("lamp", 0, x + 5, y - 3);
    const t = game.ticksPerDay;
    g.runTicks(Math.round(t * (22 / 24)) - (game.tick % t));
    g.camera.centerOn((x + 4) * 32, (y - 3) * 32);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-lamp-night.png` });
  const lampPowered = await page.evaluate(() => {
    const game = (window as any).__game.game;
    return [...game.things.values()].find((t: any) => game.reg.things.list[t.def].id === "lamp")?.powered;
  });
  expect(lampPowered).toBe(true);
  expect(errors).toEqual([]);
});
