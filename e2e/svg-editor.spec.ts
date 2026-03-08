import { test, expect } from "@playwright/test";
import path from "path";

const TEST_SVG = path.resolve("public/test.svg");
const TEST_STROKES_SVG = path.resolve("public/test-strokes.svg");
const TEST_ROUND_CAP_SVG = path.resolve("public/test-round-cap.svg");
const TEST_COMPLEX_PATHS_SVG = path.resolve("public/test-complex-paths.svg");

async function uploadSvg(page: import("@playwright/test").Page, filePath: string) {
  const fileInput = page.locator('input[type="file"][accept=".svg"]').first();
  await fileInput.setInputFiles(filePath);
}

test.describe("SVG Editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // ── File loading ──────────────────────────────────────────────

  test("shows drop zone on initial load", async ({ page }) => {
    await expect(page.getByText("SVGファイルをドラッグ＆ドロップ")).toBeVisible();
  });

  test("loads SVG via file picker", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);
    await expect(page.getByText("Inspect")).toBeVisible();
    await expect(page.getByText("SVGファイルをドラッグ＆ドロップ")).not.toBeVisible();
  });

  test("rejects non-SVG file", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: "test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
    await expect(page.getByText("SVGファイルのみ対応しています")).toBeVisible();
  });

  // ── Inspect panel ─────────────────────────────────────────────

  test("shows document info after loading", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);
    await expect(page.getByText("サイズ (px)")).toBeVisible();
    await expect(page.getByText("サイズ (mm)")).toBeVisible();
    await expect(page.getByText("総パス数")).toBeVisible();
  });

  test("shows color palette", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);
    await expect(page.getByText("色パレット")).toBeVisible();
  });

  test("can toggle between RGB and CMYK", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);
    // Default is RGB
    await expect(page.getByText(/rgb\(/).first()).toBeVisible();
    // Switch to CMYK
    await page.getByRole("button", { name: "CMYK" }).click();
    await expect(page.getByText(/^C\d+/).first()).toBeVisible();
    await expect(page.getByText("※ CMYK値は近似値です")).toBeVisible();
    // Switch back to RGB
    await page.getByRole("button", { name: "RGB" }).click();
    await expect(page.getByText(/rgb\(/).first()).toBeVisible();
  });

  test("detects small paths", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);
    await expect(page.getByText("孤立点・小パス")).toBeVisible();
    // Locate the badge near "孤立点"
    const section = page.locator("text=孤立点・小パス").locator("..");
    await expect(section.locator(".bg-orange-100")).toBeVisible();
  });

  test("detects strokes", async ({ page }) => {
    await uploadSvg(page, TEST_STROKES_SVG);
    await expect(page.getByText("ストローク", { exact: true })).toBeVisible();
    const section = page.getByText("ストローク", { exact: true }).locator("..");
    await expect(section.locator(".bg-blue-100")).toBeVisible();
  });

  // ── Cleanup: flatten ──────────────────────────────────────────

  test("flatten removes all groups", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);

    const groupsBefore = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      return svg ? svg.querySelectorAll("g").length : -1;
    });
    expect(groupsBefore).toBeGreaterThan(0);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "レイヤーを統合" }).click();

    const groupsAfter = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      return svg ? svg.querySelectorAll("g").length : -1;
    });
    expect(groupsAfter).toBe(0);
  });

  // ── Cleanup: stroke outline ───────────────────────────────────

  test("stroke outline removes stroke attributes", async ({ page }) => {
    await uploadSvg(page, TEST_STROKES_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ストロークのアウトライン化" }).click();

    await page.waitForTimeout(1000);

    const strokeCount = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      if (!svg) return -1;
      const els = svg.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon");
      let count = 0;
      for (const el of els) {
        const s = el.getAttribute("stroke") || "";
        if (s && s !== "none") count++;
      }
      return count;
    });
    expect(strokeCount).toBe(0);
  });

  // ── Edit: selection & color change ────────────────────────────

  test("click selection and color change with undo", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "レイヤーを統合" }).click();
    await page.waitForTimeout(500);

    // Click on a path using force to bypass overlap
    const preview = page.locator("div svg").first();
    const svgPath = preview.locator("path").first();
    await svgPath.click({ force: true });

    await expect(page.getByText("選択中:")).toBeVisible();

    // Get original fill
    const originalFill = await svgPath.getAttribute("fill");

    // Change color using a preset swatch (more reliable than color input)
    // Or use evaluate to trigger React's synthetic event
    const colorInput = page.locator('input[type="color"]');
    await colorInput.evaluate((el: HTMLInputElement) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, "value",
      )!.set!;
      nativeInputValueSetter.call(el, "#ff0000");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const newFill = await svgPath.getAttribute("fill");
    expect(newFill).toBe("#ff0000");

    // Undo
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(200);

    const restoredFill = await svgPath.getAttribute("fill");
    expect(restoredFill).toBe(originalFill);
  });

  // ── Edit: delete with undo ────────────────────────────────────

  test("delete selected paths with undo", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "レイヤーを統合" }).click();
    await page.waitForTimeout(500);

    const countBefore = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      return svg ? svg.querySelectorAll("path").length : 0;
    });

    // Click on a path
    const preview = page.locator("div svg").first();
    const svgPath = preview.locator("path").first();
    await svgPath.click({ force: true });

    // Delete via Edit panel's delete button (second "削除" in sidebar)
    await page.locator("aside").getByRole("button", { name: "削除" }).last().click();

    const countAfter = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      return svg ? svg.querySelectorAll("path").length : 0;
    });
    expect(countAfter).toBe(countBefore - 1);

    // Undo
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(200);

    const countRestored = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      return svg ? svg.querySelectorAll("path").length : 0;
    });
    expect(countRestored).toBe(countBefore);
  });

  // ── Export ────────────────────────────────────────────────────

  test("export button is disabled without SVG", async ({ page }) => {
    const exportBtn = page.getByRole("button", { name: "エクスポート" });
    await expect(exportBtn).toBeDisabled();
  });

  test("export button is enabled after loading SVG", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);
    const exportBtn = page.getByRole("button", { name: "エクスポート" });
    await expect(exportBtn).toBeEnabled();
  });

  // ── Zoom controls ─────────────────────────────────────────────

  test("zoom controls work", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);

    await expect(page.getByText("100%")).toBeVisible();

    await page.getByRole("button", { name: "+" }).click();
    await expect(page.getByText("110%")).toBeVisible();

    await page.getByRole("button", { name: "-" }).click();
    await expect(page.getByText("100%")).toBeVisible();

    // Reset via clicking percentage
    await page.getByRole("button", { name: "+" }).click();
    await page.getByRole("button", { name: "+" }).click();
    await page.getByText("120%").click();
    await expect(page.getByText("100%")).toBeVisible();
  });

  // ── Round cap stroke outline ─────────────────────────────────

  test("round cap strokes are outlined with arc commands", async ({ page }) => {
    await uploadSvg(page, TEST_ROUND_CAP_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ストロークのアウトライン化" }).click();
    await page.waitForTimeout(1000);

    // All strokes should be removed
    const strokeCount = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      if (!svg) return -1;
      const els = svg.querySelectorAll("path");
      let count = 0;
      for (const el of els) {
        const s = el.getAttribute("stroke") || "";
        if (s && s !== "none") count++;
      }
      return count;
    });
    expect(strokeCount).toBe(0);

    // Outline paths should contain arc commands (A) for round caps
    const hasArcs = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      if (!svg) return false;
      const paths = svg.querySelectorAll("path");
      for (const p of paths) {
        const d = p.getAttribute("d") || "";
        if (/A[\d.]+/.test(d)) return true;
      }
      return false;
    });
    expect(hasArcs).toBe(true);
  });

  test("round cap outline preserves stroke colors as fill", async ({ page }) => {
    await uploadSvg(page, TEST_ROUND_CAP_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ストロークのアウトライン化" }).click();
    await page.waitForTimeout(1000);

    // The original stroke colors should now be fill colors
    const fills = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      if (!svg) return [];
      const paths = svg.querySelectorAll("path[fill]");
      return Array.from(paths).map((p) => p.getAttribute("fill")?.toLowerCase());
    });

    // test-round-cap.svg has strokes: #E06738, #3B82F6, #10B981
    expect(fills).toContain("#e06738");
    expect(fills).toContain("#3b82f6");
    expect(fills).toContain("#10b981");
  });

  // ── Stroke outline: fill+stroke split ───────────────────────

  test("stroke outline preserves existing fill on fill+stroke elements", async ({ page }) => {
    await uploadSvg(page, TEST_STROKES_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ストロークのアウトライン化" }).click();
    await page.waitForTimeout(1000);

    // The rect in test-strokes.svg had fill="#223B52" + stroke="#E06738"
    // After outline: rect should keep fill="#223B52" without stroke, plus a new outline path with fill="#E06738"
    const result = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      if (!svg) return { hasDarkFill: false, hasStrokeOutline: false };
      const allEls = svg.querySelectorAll("path,rect");
      let hasDarkFill = false;
      let hasStrokeOutline = false;
      for (const el of allEls) {
        const fill = (el.getAttribute("fill") || "").toLowerCase();
        if (fill === "#223b52") hasDarkFill = true;
        if (fill === "#e06738") hasStrokeOutline = true;
      }
      return { hasDarkFill, hasStrokeOutline };
    });

    expect(result.hasDarkFill).toBe(true);
    expect(result.hasStrokeOutline).toBe(true);
  });

  // ── Stroke outline: dashed line segments ────────────────────

  test("dashed line outline produces multiple path segments", async ({ page }) => {
    await uploadSvg(page, TEST_STROKES_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ストロークのアウトライン化" }).click();
    await page.waitForTimeout(1000);

    // The dashed line (stroke="#F59E0B") should produce an outline path
    // whose d attribute contains multiple M commands (one per dash segment)
    const dashOutline = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      if (!svg) return { found: false, mCount: 0 };
      const paths = svg.querySelectorAll("path");
      for (const p of paths) {
        const fill = (p.getAttribute("fill") || "").toLowerCase();
        if (fill === "#f59e0b") {
          const d = p.getAttribute("d") || "";
          const mCount = (d.match(/M/g) || []).length;
          return { found: true, mCount };
        }
      }
      return { found: false, mCount: 0 };
    });

    expect(dashOutline.found).toBe(true);
    // Dashed line with pattern "10,5" over 120px => multiple segments
    expect(dashOutline.mCount).toBeGreaterThan(1);
  });

  // ── Inspect: round cap SVG stroke detection ─────────────────

  test("detects strokes in round cap SVG", async ({ page }) => {
    await uploadSvg(page, TEST_ROUND_CAP_SVG);
    await expect(page.getByText("ストローク", { exact: true })).toBeVisible();
    const section = page.getByText("ストローク", { exact: true }).locator("..");
    await expect(section.locator(".bg-blue-100")).toBeVisible();
  });

  // ── Outline confirmation message ─────────────────────────────

  test("shows visual confirmation message after stroke outline", async ({ page }) => {
    await uploadSvg(page, TEST_STROKES_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ストロークのアウトライン化" }).click();
    await page.waitForTimeout(1000);

    // Confirmation message should appear
    await expect(page.getByText("目視確認してください")).toBeVisible();
  });

  // ── Complex path outline ────────────────────────────────────

  test("complex paths are outlined without errors", async ({ page }) => {
    await uploadSvg(page, TEST_COMPLEX_PATHS_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ストロークのアウトライン化" }).click();
    await page.waitForTimeout(1000);

    // All strokes should be removed
    const strokeCount = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      if (!svg) return -1;
      const els = svg.querySelectorAll("path,polyline");
      let count = 0;
      for (const el of els) {
        const s = el.getAttribute("stroke") || "";
        if (s && s !== "none") count++;
      }
      return count;
    });
    expect(strokeCount).toBe(0);

    // All 6 stroke colors should be present as fills
    const fills = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      if (!svg) return [];
      const paths = svg.querySelectorAll("path[fill]");
      return Array.from(paths).map((p) => p.getAttribute("fill")?.toLowerCase());
    });
    expect(fills).toContain("#e06738");
    expect(fills).toContain("#3b82f6");
    expect(fills).toContain("#10b981");
    expect(fills).toContain("#f59e0b");
    expect(fills).toContain("#8b5cf6");
    expect(fills).toContain("#ef4444");
  });

  test("complex path outlines have reasonable path data", async ({ page }) => {
    await uploadSvg(page, TEST_COMPLEX_PATHS_SVG);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ストロークのアウトライン化" }).click();
    await page.waitForTimeout(1000);

    // Each outlined path should have non-trivial d attribute
    const pathLengths = await page.evaluate(() => {
      const svg = document.querySelector("div svg");
      if (!svg) return [];
      const paths = svg.querySelectorAll("path[fill]");
      return Array.from(paths)
        .filter((p) => {
          const f = (p.getAttribute("fill") || "").toLowerCase();
          return f !== "none" && f !== "";
        })
        .map((p) => (p.getAttribute("d") || "").length);
    });

    // Each outline path should have substantial path data (> 20 chars)
    for (const len of pathLengths) {
      expect(len).toBeGreaterThan(20);
    }
  });

  // ── Small path deletion ───────────────────────────────────────

  test("delete small paths with undo", async ({ page }) => {
    await uploadSvg(page, TEST_SVG);

    // Verify small path badge exists
    const smallSection = page.locator("text=孤立点・小パス").locator("..");
    await expect(smallSection.locator(".bg-orange-100")).toBeVisible();

    page.on("dialog", (dialog) => dialog.accept());
    // Click the delete button in the small paths section
    await smallSection.locator("..").getByRole("button", { name: "削除" }).click();

    // Small path count should show "なし"
    await expect(page.getByText("なし").first()).toBeVisible();

    // Undo
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(500);

    // Badge should be back
    await expect(smallSection.locator(".bg-orange-100")).toBeVisible();
  });
});
