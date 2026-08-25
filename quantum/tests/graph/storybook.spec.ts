import {describe, expect, test} from "bun:test"
import {createGraphStorybookPage} from "../../storybook/graph/page.ts"

describe("Quantum Graph Storybook", () => {
  test("uses canonical routes and rejects an unknown experiment", async () => {
    const page = createGraphStorybookPage()
    const overview = await page.routeResponse("/graph")
    expect(overview?.status).toBe(308)
    expect(overview?.headers.get("location")).toBe("/graph/")
    expect((await page.routeResponse("/graph/document/current/complete"))?.status).toBe(200)
    expect((await page.routeResponse("/graph/unknown"))?.status).toBe(404)
  })

  test("browser-compiles the real Russian laboratory entry", async () => {
    const page = createGraphStorybookPage()
    const html = await page.htmlResponse()
    const text = await html.text()
    expect(text).toContain("Quantum · лаборатория Graph")
    expect(text).toContain('id="quantum-storybook-canvas"')
    expect(text).toContain("Создано для MetaFor")
    expect(text).not.toContain("reusable WebGPU UI")

    const entry = await page.assetResponse("/@storybook-assets/graph/entry.js")
    expect(entry?.status).toBe(200)
    const source = await entry!.text()
    expect(source).toContain("quantumStorybook")
    expect(source).toContain("StorybookBackdropSurface")
    expect(source).toContain("GraphLabState")
    expect(page.diagnostics.builds).toBe(1)
  })
})
