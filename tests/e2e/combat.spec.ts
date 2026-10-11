import { expect, test } from "@playwright/test";

test("a raid pauses the game, survivors draft and fight", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?seed=e2e-combat");
  await page.waitForFunction(() => (window as any).__game?.ready === true);

  await page.evaluate(() => {
    const g = (window as any).__game;
    g.game.story.points = 5;
    g.sim.fireEvent(g.game, "raid");
  });
  // Auto-pause on the raid message (the UI drains messages a few times per second).
  await expect.poll(() => page.evaluate(() => document.querySelector(".speed button.on")?.getAttribute("aria-label"))).toContain("Pause");
  // The message that paused the game stays on screen, tagged "Paused", for as long as the game is paused.
  await expect(page.getByTestId("pause-reason")).toBeVisible();
  await page.waitForTimeout(9000);
  await expect(page.getByTestId("pause-reason")).toBeVisible();
  await page.screenshot({ path: `artifacts/screens/pause-reason-${info.project.name}.png` });

  await page.getByTestId("draft-all").click();
  const drafted = await page.evaluate(() => [...(window as any).__game.game.pawns.values()].filter((p: any) => p.drafted).length);
  expect(drafted).toBe(3);

  // Select a survivor; the panel shows health and the release button.
  await page.getByTestId("colonists").locator("button").first().click();
  await expect(page.getByTestId("pawn-panel")).toContainText("Health");
  await expect(page.getByTestId("draft")).toBeVisible();

  // Let the raiders walk in and the fight start, then look.
  await page.evaluate(() => {
    const g = (window as any).__game;
    for (let i = 0; i < 4000; i++) {
      g.runTicks(1);
      if (g.game.fx.some((f: any) => g.game.tick - f.tick < 3)) break;
    }
    const r = [...g.game.pawns.values()].find((p: any) => p.faction === "raiders");
    const c = [...g.game.pawns.values()].find((p: any) => p.faction === "colony");
    const t = r ?? c;
    g.camera.centerOn(((t.x + c.x) / 2) * 32, ((t.y + c.y) / 2) * 32);
    g.camera.zoom = 0.9;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `artifacts/screens/${info.project.name}-combat.png` });
  expect(await page.evaluate(() => (window as any).__game.game.fx.length)).toBeGreaterThan(0);

  // A full in-game day later the raid is over one way or another.
  await page.evaluate(() => (window as any).__game.runTicks((window as any).__game.game.ticksPerDay));
  // Lairs (N1) stay on the map; only the raid must be over.
  expect(await page.evaluate(() => [...(window as any).__game.game.groups.values()].filter((g: { kind: string }) => g.kind !== "lair").length)).toBe(0);
  expect(errors).toEqual([]);
});
