import { expect, test } from "@playwright/test";

test("the Gear tab shows slots, combat stats and protection", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-gear");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.pause();
    const p = [...g.game.pawns.values()].find((x: any) => x.faction === "colony");
    const reg = g.game.reg.items;
    p.weapon = reg.idx("hunting_rifle");
    p.armor = [reg.idx("scrap_vest"), reg.idx("plate_helmet")];
    g.selectPawn(p.id);
  });
  await page.getByTestId("tab-gear").click();
  const tab = page.getByTestId("gear-tab");
  await expect(tab).toBeVisible();
  await expect(page.getByTestId("slot-weapon")).toContainText("rifle");
  await expect(page.getByTestId("slot-head")).not.toContainText("Nothing");
  await expect(page.getByTestId("gear-protection")).toContainText("%");
  await expect(page.getByTestId("slot-clothes")).toContainText("Patched clothes");
  await expect(page.getByTestId("slot-clothes")).toContainText("°C");
  await page.screenshot({ path: `artifacts/screens/gear-${info.project.name}.png` });
  // Drop the helmet: the slot empties and offers Allow gear.
  await page.getByTestId("drop-head").click();
  await expect(page.getByTestId("slot-head")).toContainText("Nothing");
  await expect(page.getByTestId("allow-head")).toBeVisible();
  await page.screenshot({ path: `artifacts/screens/gear-dropped-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
