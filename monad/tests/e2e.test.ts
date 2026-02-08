import { test, expect } from "bun:test";
import { createHeadlessFixture } from "./fixtures";

test("MonadSystem runs simulation on GPU", async () => {
  const { page, cleanup, url } = await createHeadlessFixture();

  try {
    await page.goto(url, { waitUntil: "networkidle0" });

    // Wait for the simulation to complete
    await page.waitForFunction(
      () => document.getElementById("output")?.innerText.includes("Новые состояния"),
      { timeout: 5000 }
    );

    const status = await page.evaluate(() => document.getElementById("status")?.innerText || "");
    const output = await page.evaluate(() => document.getElementById("output")?.innerText || "");

    if (status.includes("❌")) {
        throw new Error(`Simulation failed in browser status: ${status}\nOutput: ${output}`);
    }

    expect(status).toContain("✅ WebGPU Active");
    expect(output).toContain("Начальные состояния: [\"IDLE\",\"IDLE\"]");
    // Агент 0: hp=100 -> update до 50 -> не удовлетворяет условиям (не >50 и не <=0) -> остается IDLE
    // Агент 1: hp=0 -> удовлетворяет условию hp<=0 -> переходит в DEAD
    expect(output).toContain("Новые состояния:     [\"IDLE\",\"DEAD\"]");

  } finally {
    await cleanup();
  }
}, 15000);
