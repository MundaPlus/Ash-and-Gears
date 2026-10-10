import { expect, test } from "@playwright/test";

test("draft all, select all, and move the whole group with one click", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-group");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const target = await page.evaluate(() => {
    const g = (window as any).__game, game = g.game, L = game.map.layers[0];
    g.pause();
    const { x, y } = game.home;
    for (let ty = y - 10; ty <= y + 2; ty++)
      for (let tx = x - 2; tx <= x + 12; tx++) {
        const th = L.thing[L.i(tx, ty)];
        if (th !== -1) game.removeThing(th);
        game.setTerrain(0, tx, ty, "dirt");
      }
    g.camera.zoom = 1.5;
    g.camera.centerOn((x + 6) * 32, (y - 6) * 32);
    return { x: x + 8, y: y - 7 };
  });
  await page.getByTestId("draft-all").click();
  await page.getByTestId("select-all").click();
  await expect(page.getByTestId("select-all")).toHaveClass(/on/);
  const at = await page.evaluate(([tx, ty]) => {
    const g = (window as any).__game, c = g.camera, r = g.app.canvas.getBoundingClientRect();
    return { x: r.left + (tx * 32 + 16 - c.x) * c.zoom + c.viewW / 2, y: r.top + (ty * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
  }, [target.x, target.y]);
  await page.mouse.click(at.x, at.y);
  const orders = await page.evaluate(() =>
    [...(window as any).__game.game.pawns.values()].filter((p: any) => p.faction === "colony").map((p: any) => (p.order?.kind === "move" ? `${p.order.pos.x},${p.order.pos.y}` : null)),
  );
  expect(orders.every((o: string | null) => o !== null)).toBe(true);
  expect(new Set(orders).size).toBe(orders.length);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-group.png` });
  expect(errors).toEqual([]);
});
