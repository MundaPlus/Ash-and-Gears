import { expect, test } from "@playwright/test";

test("a drafted survivor moves on a right-click, also on asphalt (no menu)", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "phones have no right-click");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-draft");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const at0 = await page.evaluate(() => {
    const g = (window as any).__game, game = g.game, L = game.map.layers[0];
    g.pause();
    const p = [...game.pawns.values()].find((x: any) => x.faction === "colony");
    p.path = null;
    p.moveT = 0;
    p.job = null;
    // Old asphalt with a loose item: a tile that has a "Remove floor" action.
    const tx = p.x + 5, ty = p.y + 3;
    const th = L.thing[L.i(tx, ty)];
    if (th !== -1) game.removeThing(th);
    game.setTerrain(0, tx, ty, "asphalt");
    g.camera.zoom = 1.5;
    g.camera.centerOn(p.x * 32, p.y * 32);
    return { id: p.id, x: p.x, y: p.y, tx, ty };
  });
  const scr = (tx: number, ty: number) =>
    page.evaluate(([tx, ty]) => {
      const g = (window as any).__game, c = g.camera, r = g.app.canvas.getBoundingClientRect();
      return { x: r.left + (tx * 32 + 16 - c.x) * c.zoom + c.viewW / 2, y: r.top + (ty * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
    }, [tx, ty]);
  let a = await scr(at0.x, at0.y);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.press("r");
  a = await scr(at0.tx, at0.ty);
  await page.mouse.click(a.x, a.y, { button: "right" });
  const order = await page.evaluate((id) => (window as any).__game.game.pawns.get(id).order, at0.id);
  expect(order?.kind).toBe("move");
  expect([order.pos.x, order.pos.y]).toEqual([at0.tx, at0.ty]);
  await expect(page.locator(".pawnmenu")).toHaveCount(0);
  expect(errors).toEqual([]);
});
