import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("desktop case-file shell keeps chat as the primary input", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /new credit review/i })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await expect(page.getByRole("button", { name: /attach report/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /run agent/i })).toBeVisible();
  await expect(page.getByText("Follow-up agents")).toBeVisible();
  await expect(page.getByText("Ticker MCK")).toHaveCount(0);
  await expect(page.getByText("Agreement detected")).toHaveCount(0);

  const metrics = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    visibleTextInputs: document.querySelectorAll('input:not([type="file"]), textarea').length,
    bodyScrollHeight: document.body.scrollHeight,
    viewportHeight: window.innerHeight
  }));

  expect(metrics.horizontalOverflow).toBe(false);
  expect(metrics.visibleTextInputs).toBe(1);
  expect(metrics.bodyScrollHeight).toBe(metrics.viewportHeight);
});

test("desktop composer shows selected SEC html attachments", async ({ page }, testInfo) => {
  await mkdir(testInfo.outputDir, { recursive: true });
  const filingPath = join(testInfo.outputDir, "sample-sec-filing.html");
  await writeFile(filingPath, "<html><body>SEC filing sample</body></html>");

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(filingPath);

  await expect(page.getByText("sample-sec-filing.html")).toBeVisible();
  await expect(page.locator('[data-slot="attachment"]')).toHaveCount(1);
});
