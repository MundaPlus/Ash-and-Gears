import { expect, test } from "@playwright/test";

test("right-click a hurt friend with a survivor selected: a menu offers tend, and the survivor goes", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-menu");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const at = await page.evaluate(() => {
    const g = (window as any).__game, game = g.game, L = game.map.layers[0];
    g.pause();
    const { x, y } = game.home;
    for (let ty = y - 4; ty <= y + 4; ty++)
      for (let tx = x - 4; tx <= x + 4; tx++) {
        const th = L.thing[L.i(tx, ty)];
        if (th !== -1) game.removeThing(th);
        game.setTerrain(0, tx, ty, "dirt");
      }
    const [a, b] = [...game.pawns.values()].filter((p: any) => p.faction === "colony");
    a.x = x - 2; a.y = y; a.path = null; a.job = null;
    b.x = x + 2; b.y = y; b.path = null; b.job = null;
    b.health.injuries.push({ part: "l_leg", kind: "cut", dmg: 8, tended: 0 });
    b.health.downed = true;
    g.camera.zoom = 2;
    g.camera.centerOn(x * 32, y * 32);
    g.selectPawn(a.id);
    const c = g.camera, r = g.app.canvas.getBoundingClientRect();
    return { a: a.id, sx: r.left + ((x + 2) * 32 + 16 - c.x) * c.zoom + c.viewW / 2, sy: r.top + (y * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
  });
  await page.mouse.click(at.sx, at.sy, { button: "right" });
  await expect(page.getByTestId("pawn-menu")).toBeVisible();
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-pawn-menu.png` });
  await page.getByTestId("pawn-menu-tend").click();
  await expect(page.getByTestId("pawn-menu")).toBeHidden();
  const job = await page.evaluate((id) => (window as any).__game.game.pawns.get(id).job?.kind, at.a);
  expect(job).toBe("tend");
  expect(errors).toEqual([]);
});

test("right-click a rock with a survivor selected: Mine forces the order at once", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-force");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const at = await page.evaluate(() => {
    const g = (window as any).__game, game = g.game, L = game.map.layers[0];
    g.pause();
    const { x, y } = game.home;
    for (let ty = y - 4; ty <= y + 4; ty++)
      for (let tx = x - 4; tx <= x + 4; tx++) {
        const th = L.thing[L.i(tx, ty)];
        if (th !== -1) game.removeThing(th);
        game.setTerrain(0, tx, ty, "dirt");
      }
    game.setTerrain(0, x + 3, y, "rock");
    const [a] = [...game.pawns.values()].filter((p: any) => p.faction === "colony");
    delete a.noWork;
    g.camera.zoom = 2;
    // The rock in the upper middle of the screen (on phones the survivor panel covers the lower part).
    g.camera.centerOn((x + 3) * 32 + 16, (y + 3) * 32);
    g.selectPawn(a.id);
    const c = g.camera, r = g.app.canvas.getBoundingClientRect();
    return { a: a.id, sx: r.left + ((x + 3) * 32 + 16 - c.x) * c.zoom + c.viewW / 2, sy: r.top + (y * 32 + 16 - c.y) * c.zoom + c.viewH / 2 };
  });
  await page.mouse.click(at.sx, at.sy, { button: "right" });
  await expect(page.getByTestId("pawn-menu-do_mine")).toBeVisible();
  await page.getByTestId("pawn-menu-do_mine").click();
  const job = await page.evaluate((id) => {
    const j = (window as any).__game.game.pawns.get(id).job;
    return j ? `${j.kind}:${j.data?.task}` : null;
  }, at.a);
  expect(job).toBe("work:mine");
  expect(errors).toEqual([]);
});
