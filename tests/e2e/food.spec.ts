import { expect, test } from "@playwright/test";

test("grow zone, campfire bills and a radiation cloud", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?seed=e2e-food");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.pause());

  // Clear ground near home, place a campfire and raw food, center the camera.
  await page.evaluate(() => {
    const g = (window as any).__game;
    const { game, sim } = g;
    const { x, y } = game.home;
    for (let ty = y - 8; ty <= y + 8; ty++)
      for (let tx = x - 8; tx <= x + 8; tx++) {
        const L = game.map.layers[0];
        const th = L.thing[L.i(tx, ty)];
        if (th !== -1 && Math.abs(tx - x) + Math.abs(ty - y) > 3) game.removeThing(th);
      }
    for (let ty = y - 7; ty <= y - 3; ty++) for (let tx = x - 7; tx <= x - 3; tx++) game.setTerrain(0, tx, ty, "rich_soil");
    game.spawnThing("campfire", 0, x + 4, y - 4);
    sim.dropItems(game, "glowcorn", 60, 0, x + 6, y - 4);
    g.camera.zoom = 1.2;
    g.camera.centerOn((x + 0.5) * 32, (y - 2) * 32);
  });

  // Grow zone through the UI.
  const toScreen = (dx: number, dy: number) =>
    page.evaluate(([dx, dy]) => {
      const g = (window as any).__game;
      const { x, y } = g.game.home;
      const c = g.camera;
      const r = g.app.canvas.getBoundingClientRect();
      return { x: r.left + ((x + dx) * 32 + 16 - c.x) * c.zoom + c.viewW / 2, y: r.top + ((y + dy) * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
    }, [dx, dy]);
  const center = (dx: number, dy: number) =>
    page.evaluate(([dx, dy]) => {
      const g = (window as any).__game;
      g.camera.centerOn((g.game.home.x + dx + 0.5) * 32, (g.game.home.y + dy + 0.5) * 32);
      g.camera.update(0);
    }, [dx, dy]);
  await center(-5, -5);
  await page.getByTestId("tb-zones").click();
  await page.getByTestId("zone-grow-glowcorn_plant").click();
  const a = await toScreen(-7, -7), b = await toScreen(-3, -3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const zoneTiles = await page.evaluate(() => {
    const { game } = (window as any).__game;
    return [...game.map.layers[0].zone].filter((z: number) => z !== -1 && game.zones.get(z)?.kind === "grow").length;
  });
  expect(zoneTiles).toBe(25);

  // Tap the campfire: the bill panel shows the meal target.
  await center(4, -4);
  const fire = await toScreen(4, -4);
  await page.mouse.click(fire.x, fire.y);
  await expect(page.getByTestId("bills")).toBeVisible();
  await expect(page.getByTestId("bills")).toContainText("Simple meal");

  // Two days pass: crops sprout, meals get cooked.
  await page.evaluate(() => (window as any).__game.runTicks((window as any).__game.game.ticksPerDay * 2));
  // Meals get eaten as fast as they are cooked, so check that raw food was used up.
  const rawLeft = await page.evaluate(() => (window as any).__game.sim.countItems((window as any).__game.game, "glowcorn"));
  const plants = await page.evaluate(() => {
    const { game } = (window as any).__game;
    return [...game.things.values()].filter((t: any) => game.reg.things.list[t.def].id === "glowcorn_plant").length;
  });
  expect(plants).toBeGreaterThan(5);
  expect(rawLeft).toBeLessThan(60);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-farm.png` });

  // Radiation cloud: warning banner, then the cloud.
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sim.scheduleRadCloud(g.game, 1);
  });
  await page.waitForTimeout(300);
  await expect(page.getByTestId("rad-banner")).toBeVisible();
  await page.evaluate(() => (window as any).__game.runTicks(Math.round((window as any).__game.game.ticksPerHour * 2)));
  await page.evaluate(() => (window as any).__game.setSpeed(1));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-radcloud.png` });
  expect(await page.evaluate(() => (window as any).__game.game.weather.kind)).toBe("rad_cloud");
  expect(errors).toEqual([]);
});
