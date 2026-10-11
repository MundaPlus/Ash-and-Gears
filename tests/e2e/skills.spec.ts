import { expect, test } from "@playwright/test";

test("the skill list shows progress to the next level", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-skills");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.pause();
    const p = [...g.game.pawns.values()].find((x: any) => x.faction === "colony");
    const s = p.skills[g.game.reg.skills.idx("cooking")];
    s.xp = g.sim.XP_PER_LEVEL(s.level) * 0.6;
    g.selectPawn(p.id);
  });
  await expect(page.locator(".skills i.xp").first()).toBeAttached();
  // The top bar shows all food in days (meals count too), and canned food as "Cans".
  await expect(page.getByTestId("food-days")).toContainText(" d");
  await expect(page.getByTestId("resources")).toContainText("Cans");
  await page.screenshot({ path: `artifacts/screens/skills-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
