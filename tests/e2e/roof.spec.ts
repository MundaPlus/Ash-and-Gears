import { expect, test, type Page } from "@playwright/test";

/** Tile center to screen point. */
const toScreen = (page: Page, tx: number, ty: number) =>
  page.evaluate(([tx, ty]) => {
    const g = (window as any).__game;
    const c = g.camera;
    const r = g.app.canvas.getBoundingClientRect();
    return { x: r.left + (tx * 32 + 16 - c.x) * c.zoom + c.viewW / 2, y: r.top + (ty * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
  }, [tx, ty]);

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test("a closed room gets a roof from the survivors, and an airlock seals it", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?seed=e2e-roof");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.pause());

  const area = await page.evaluate(() => {
    const g = (window as any).__game;
    const game = g.game;
    const { x, y } = game.home;
    const L = game.map.layers[0];
    for (let ty = y - 10; ty <= y - 1; ty++)
      for (let tx = x - 10; tx <= x - 1; tx++) {
        const th = L.thing[L.i(tx, ty)];
        if (th !== -1) game.removeThing(th);
        game.setTerrain(0, tx, ty, "dirt");
      }
    g.sim.dropItems(game, "scrap", 150, 0, x + 1, y + 1);
    g.camera.zoom = 1;
    g.camera.centerOn((x - 5) * 32, (y - 5) * 32);
    return { x0: x - 8, y0: y - 8, x1: x - 3, y1: y - 3 };
  });

  // Walls by drag, then a door over the south wall plan, then a second door below it set between
  // two more walls (airlock).
  await page.getByTestId("tb-build").click();
  await page.getByTestId("build-scrap_wall").click();
  await drag(page, await toScreen(page, area.x0, area.y0), await toScreen(page, area.x1, area.y1));
  await page.keyboard.press("Escape");
  await page.getByTestId("tb-build").click();
  await page.getByTestId("build-scrap_door").click();
  for (const [tx, ty] of [[area.x0 + 2, area.y1], [area.x0 + 2, area.y1 + 1]]) {
    const p = await toScreen(page, tx, ty);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press("Escape");
  await page.getByTestId("tb-build").click();
  await page.getByTestId("build-scrap_wall").click();
  for (const [tx, ty] of [[area.x0 + 1, area.y1 + 1], [area.x0 + 3, area.y1 + 1]]) {
    const p = await toScreen(page, tx, ty);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press("Escape");

  // Run until the walls stand. The room then waits for its roof (blue hatch).
  const walls = await page.evaluate(() => {
    const g = (window as any).__game;
    for (let i = 0; i < 12 && g.game.blueprints.size; i++) g.runTicks(g.game.ticksPerHour * 2);
    return { left: g.game.blueprints.size, todo: g.game.roofTodo.size };
  });
  expect(walls.left).toBe(0);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-roof-waiting.png` });

  const done = await page.evaluate(() => {
    const g = (window as any).__game;
    for (let i = 0; i < 12 && g.game.roofTodo.size; i++) g.runTicks(g.game.ticksPerHour);
    return g.game.roofTodo.size;
  });
  expect(done).toBe(0);
  await page.waitForTimeout(200);

  // Inspect a tile inside: it says the room is sealed.
  const inside = await toScreen(page, area.x0 + 2, area.y0 + 2);
  await page.mouse.click(inside.x, inside.y);
  await expect(page.getByText("Sealed: roof and airlock", { exact: false })).toBeVisible();
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-roof-sealed.png` });
  expect(walls.todo).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
