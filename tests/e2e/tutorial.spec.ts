import { expect, test, type Page } from "@playwright/test";

/** Step the sim until the tutorial shows `id` (the UI updates a moment later). */
async function reach(page: Page, id: string) {
  await page.evaluate((id) => {
    const g = (window as any).__game;
    for (let i = 0; i < 7200 * 3 && g.sim.TUTORIAL_STEPS[g.game.tutorial.step] !== id; i++) g.game.step();
  }, id);
  await expect(page.getByTestId("tutorial")).toHaveAttribute("data-step", id);
}

test("tutorial: start from the title, follow the steps, finish", async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = (name: string) => page.screenshot({ path: `artifacts/screens/${info.project.name}-tutorial-${name}.png` });
  const phone = info.project.name === "phone";

  await page.goto("/");
  await page.getByTestId("tutorial-btn").click();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const size = await page.evaluate(() => (window as any).__game.game.map.w);
  expect(size).toBe(64);
  const panel = page.getByTestId("tutorial");
  await expect(panel).toHaveAttribute("data-step", "camera");
  await shot("1-camera");

  // Move the view: the keyboard on a desktop, the camera hook on a phone.
  if (phone) await page.evaluate(() => (window as any).__game.camera.centerOn(200, 200));
  else {
    await page.keyboard.down("d");
    await page.waitForTimeout(600);
    await page.keyboard.up("d");
  }
  await expect(page.getByTestId("tutorial-do")).toContainText("✔");
  await reach(page, "time");
  await expect(page.getByTestId("speed-pause")).toHaveClass(/tut-hl/);
  await page.getByTestId("speed-pause").click();
  await page.getByTestId("speed-1").click();
  await reach(page, "select");
  await page.locator("[data-testid=colonists] .colonist").first().click();
  await reach(page, "stockpile");
  await expect(page.getByTestId("tb-zones")).toHaveClass(/tut-hl/);
  await page.getByTestId("tb-zones").click();
  await expect(page.getByTestId("zone-stockpile")).toHaveClass(/tut-hl/);
  await shot("2-stockpile-menu");
  await page.keyboard.press("Escape");

  // The rest through the sim, as a player would do with the mouse.
  await page.evaluate(() => {
    const { game, sim } = (window as any).__game;
    const tiles = [];
    for (let y = 36; y <= 40; y++) for (let x = 26; x <= 30; x++) tiles.push({ x, y });
    sim.createZone(game, "stockpile", 0, tiles);
  });
  await reach(page, "cut");
  await page.evaluate(() => {
    const { game, sim } = (window as any).__game;
    for (const t of [...game.things.values()].filter((t: any) => game.reg.things.list[t.def].id === "dead_tree").slice(0, 8)) sim.designate(game, "cut", 0, t.x, t.y);
  });
  await reach(page, "room");
  await expect(page.getByTestId("tb-build")).toHaveClass(/tut-hl/);
  await page.getByTestId("tb-build").click();
  await expect(page.getByTestId("build-wood_wall")).toHaveClass(/tut-hl/);
  await shot("3-room");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const { game, sim } = (window as any).__game;
    for (let y = 20; y <= 24; y++)
      for (let x = 25; x <= 29; x++) if (x === 25 || x === 29 || y === 20 || y === 24) sim.placeBlueprint(game, "thing", x === 27 && y === 24 ? "scrap_door" : "wood_wall", 0, x, y);
  });
  await reach(page, "bed");
  await page.evaluate(() => {
    const { game, sim } = (window as any).__game;
    sim.placeBlueprint(game, "thing", "bedroll", 0, 26, 21);
  });
  await reach(page, "grow");
  await page.evaluate(() => {
    const { game, sim } = (window as any).__game;
    const tiles = [];
    for (let y = 26; y <= 33; y++) for (let x = 14; x <= 21; x++) tiles.push({ x, y });
    sim.createZone(game, "grow", 0, tiles, [], "scrub_potato_plant");
  });
  await reach(page, "work");
  await page.getByTestId("tb-work").click();
  await page.locator("[data-testid=work-grid] button.prio").first().click();
  await page.keyboard.press("Escape");
  await reach(page, "cook");
  await page.evaluate(() => {
    const { game, sim } = (window as any).__game;
    sim.placeBlueprint(game, "thing", "campfire", 0, 33, 37);
  });
  await reach(page, "research");
  await page.evaluate(() => {
    const { game, sim } = (window as any).__game;
    sim.placeBlueprint(game, "thing", "research_desk", 0, 35, 25);
  });
  await page.getByTestId("tb-research").click();
  await expect(page.getByTestId("research-field_medicine")).toHaveClass(/tut-hl/);
  await page.getByTestId("research-field_medicine").click();
  await page.keyboard.press("Escape");
  await reach(page, "draft");
  await page.evaluate(() => {
    const { game, sim } = (window as any).__game;
    const p = [...game.pawns.values()].find((p: any) => p.faction === "colony");
    sim.orderMove(game, p, { layer: 0, x: p.x + 3, y: p.y });
  });
  await reach(page, "raid");
  await expect(page.getByTestId("draft-all")).toHaveClass(/tut-hl/);
  await page.getByTestId("draft-all").click();
  await page.evaluate(() => (window as any).__game.camera.centerOn(48 * 32, 30 * 32));
  await page.evaluate(() => (window as any).__game.runTicks(600));
  await shot("4-raid");
  await reach(page, "done");
  await shot("5-done");
  expect(await page.evaluate(() => (window as any).__game.game.opts.idleWork)).toBe(true);
  expect(errors).toEqual([]);
});
