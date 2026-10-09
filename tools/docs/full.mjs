import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await p.goto(process.argv[2]);
await p.waitForTimeout(600);
const w = await p.evaluate(() => document.documentElement.scrollWidth);
console.log("scrollWidth", w);
await p.screenshot({ path: process.argv[3], fullPage: true });
await b.close();
