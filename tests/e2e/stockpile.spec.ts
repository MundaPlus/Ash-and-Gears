import { expect, test } from "@playwright/test";

test("stockpile item filter: open a category, turn one item off, copy and paste", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?seed=e2e-stock");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.pause());

  // Two stockpiles on clear ground left-up of home.
  const at = await page.evaluate(() => {
    const g = (window as any).__game;
    const game = g.game;
    const { x, y } = game.home;
    const L = game.map.layers[0];
    for (let ty = y - 8; ty <= y - 2; ty++)
      for (let tx = x - 8; tx <= x - 2; tx++) {
        const th = L.thing[L.i(tx, ty)];
        if (th !== -1) game.removeThing(th);
        game.setTerrain(0, tx, ty, "dirt");
      }
    g.sim.createZone(game, "stockpile", 0, [{ x: x - 7, y: y - 7 }, { x: x - 6, y: y - 7 }]);
    g.sim.createZone(game, "stockpile", 0, [{ x: x - 3, y: y - 3 }, { x: x - 3, y: y - 4 }]);
    g.camera.zoom = 1;
    g.camera.centerOn((x - 5) * 32, (y - 5) * 32);
    return { a: { x: x - 7, y: y - 7 }, b: { x: x - 3, y: y - 3 } };
  });
  const click = async (tx: number, ty: number) => {
    const p = await page.evaluate(
      ([tx, ty]) => {
        const g = (window as any).__game;
        const c = g.camera;
        // Center the target: on a phone the panel covers the lower half.
        c.centerOn(tx * 32 + 16, ty * 32 + 16 + 120);
        const r = g.app.canvas.getBoundingClientRect();
        return { x: r.left + (tx * 32 + 16 - c.x) * c.zoom + c.viewW / 2, y: r.top + (ty * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
      },
      [tx, ty],
    );
    await page.mouse.click(p.x, p.y);
  };
  const zoneAt = (tx: number, ty: number) =>
    page.evaluate(([tx, ty]) => {
      const game = (window as any).__game.game;
      const L = game.map.layers[0];
      const z = game.zones.get(L.zone[L.i(tx, ty)]);
      return { allow: [...z.allow], allowItems: z.allowItems ? [...z.allowItems] : null };
    }, [tx, ty]);

  await click(at.a.x, at.a.y);
  await expect(page.getByTestId("stockpile")).toBeVisible();
  await expect(page.getByTestId("stock-cat-resource")).toHaveClass(/on/);
  await page.getByTestId("stock-open-resource").click();
  await page.getByTestId("stock-item-wood").click();
  await expect(page.getByTestId("stock-item-wood")).not.toHaveClass(/on/);
  await expect(page.getByTestId("stock-cat-resource")).toHaveClass(/partial/);
  await page.getByTestId("stock-copy").click();
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-stockpile-filter.png` });
  const a = await zoneAt(at.a.x, at.a.y);
  expect(a.allowItems).not.toContain("wood");
  expect(a.allowItems).toContain("scrap");

  // Paste onto the other stockpile.
  await click(at.b.x, at.b.y);
  await expect(page.getByTestId("stock-paste")).toBeEnabled();
  await page.getByTestId("stock-paste").click();
  await expect(page.getByTestId("stock-cat-resource")).toHaveClass(/partial/);
  const b = await zoneAt(at.b.x, at.b.y);
  expect(b.allowItems).toEqual(a.allowItems);
  expect(errors).toEqual([]);
});
