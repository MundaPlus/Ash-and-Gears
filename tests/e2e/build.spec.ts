import { expect, test } from "@playwright/test";

test("build a room with the toolbar and watch it get built", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?seed=e2e-build");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.pause());

  // Give enough scrap, and clear an area left-up of home so the drag lands on open ground.
  const area = await page.evaluate(() => {
    const g = (window as any).__game;
    const game = g.game;
    const { x, y } = game.home;
    for (let ty = y - 9; ty <= y - 2; ty++)
      for (let tx = x - 9; tx <= x - 2; tx++) {
        const L = game.map.layers[0];
        const th = L.thing[L.i(tx, ty)];
        if (th !== -1) game.removeThing(th);
        game.setTerrain(0, tx, ty, "dirt");
      }
    g.camera.zoom = 1;
    g.camera.centerOn((x - 5) * 32, (y - 5) * 32);
    return { x0: x - 8, y0: y - 8, x1: x - 3, y1: y - 3 };
  });

  await page.getByTestId("tb-build").click();
  await page.getByTestId("build-scrap_wall").click();
  await expect(page.getByTestId("tool-hint")).toBeVisible();

  // Convert tile corners to screen points and drag an outline.
  const toScreen = (tx: number, ty: number) =>
    page.evaluate(([tx, ty]) => {
      const g = (window as any).__game;
      const c = g.camera;
      const r = g.app.canvas.getBoundingClientRect();
      return { x: r.left + (tx * 32 + 16 - c.x) * c.zoom + c.viewW / 2, y: r.top + (ty * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
    }, [tx, ty]);
  const a = await toScreen(area.x0, area.y0);
  const b = await toScreen(area.x1, area.y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  const bps = await page.evaluate(() => (window as any).__game.game.blueprints.size);
  expect(bps).toBe(20); // 6x6 outline

  await page.screenshot({ path: `artifacts/screens/${info.project.name}-blueprints.png` });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tool-hint")).toBeHidden();

  // Work grid opens and changes a priority.
  await page.getByTestId("tb-work").click();
  await expect(page.getByTestId("work-grid")).toBeVisible();
  const cell = page.locator('[data-testid^="work-"][data-testid$="-construct"]').first();
  await cell.click();
  await expect(cell).toContainText("4");
  await page.getByTestId("tb-work").click();

  // Let them build: give scrap and run ~1 in-game day.
  await page.evaluate(() => {
    const g = (window as any).__game;
    const game = g.game;
    const { x, y } = game.home;
    // dropItems is not on window; place scrap with a cheap trick: reuse start-supply tiles.
    for (const s of game.items.values()) if (game.reg.items.list[s.def].id === "scrap") s.count = 75;
    g.runTicks(game.ticksPerDay);
    return { x, y };
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-built.png` });
  const left = await page.evaluate(() => (window as any).__game.game.blueprints.size);
  expect(left).toBeLessThan(20);
  expect(errors).toEqual([]);
});
