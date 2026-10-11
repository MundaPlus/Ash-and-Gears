import { expect, test } from "@playwright/test";

test("bottom bar: shortcut keys open each menu; the version shows in the lower left", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?seed=e2e-menus");
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.pause());
  const phone = info.project.name === "phone";
  if (!phone) await expect(page.getByTestId("version")).toContainText("v0.");
  const menus: [string, string, string][] = [
    ["b", "build-menu", "build"],
    ["o", "orders-menu", "orders"],
    ["z", "zones-menu", "zones"],
    ["j", "work-grid", "work"],
    ["t", "research-panel", "research"],
    ["m", "world-panel", "world"],
  ];
  for (const [key, testid, name] of menus) {
    if (phone) await page.getByTestId(`tb-${name}`).click();
    else await page.keyboard.press(key);
    await expect(page.getByTestId(testid)).toBeVisible();
    await expect(page.getByTestId(`tb-${name}`)).toHaveClass(/on/);
    await page.screenshot({ path: `artifacts/screens/menu-${name}-${info.project.name}.png` });
    // The same key (or Esc) closes it again.
    if (phone) await page.getByTestId(`tb-${name}`).click();
    else await page.keyboard.press(key === "m" ? "Escape" : key);
    await expect(page.getByTestId(testid)).toBeHidden();
  }
  expect(errors).toEqual([]);
});
