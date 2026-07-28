import {describe, expect, test} from "bun:test"
import {
  FORM_SKIN_GEOMETRY,
  FORM_SKINS,
  buildFormGeometry,
  measureFormSkinLoad,
} from "./FormSkinLab.ts"

describe("Form Skin Lab", () => {
  test("offers the same skin catalog to Sphere and Torus geometry", () => {
    expect(FORM_SKINS.map((skin) => skin.id)).toEqual([
      "wire",
      "glow",
      "silhouette",
      "solid",
      "hybrid",
    ])
    expect(buildFormGeometry("sphere", 24, 8, 0.28).mesh.index?.count)
      .toBeGreaterThan(0)
    expect(buildFormGeometry("torus", 24, 8, 0.28).mesh.index?.count)
      .toBeGreaterThan(0)
  })

  test("keeps form geometry fixed outside the skin controls", async () => {
    expect(FORM_SKIN_GEOMETRY).toEqual({
      detail: 24,
      size: 8,
      tubeRatio: 0.28,
    })
    const page = await Bun.file(
      new URL("./index.html", import.meta.url),
    ).text()

    expect(page).not.toContain("form-skin-detail")
    expect(page).not.toContain("form-skin-size")
    expect(page).not.toContain("form-skin-tube")
    expect(page).not.toContain("form-skin-animation")
    expect(page).toContain("form-skin-run-current")
    expect(page).toContain("form-skin-run-all")
  })

  test("reports exact pass multiplication and shared geometry cost", () => {
    const geometry = buildFormGeometry("sphere", 24, 8, 0.28)
    const glow = measureFormSkinLoad(geometry, "glow", 3)
    const hybrid = measureFormSkinLoad(geometry, "hybrid", 3)

    expect(glow.drawCalls).toBe(3)
    expect(glow.passesPerForm).toBe(1)
    expect(glow.renderObjects).toBe(3)
    expect(glow.triangles).toBe(0)
    expect(glow.lineSegments).toBeGreaterThan(0)
    expect(hybrid.drawCalls).toBe(6)
    expect(hybrid.passesPerForm).toBe(2)
    expect(hybrid.renderObjects).toBe(6)
    expect(hybrid.triangles).toBeGreaterThan(0)
    expect(hybrid.geometryBytes).toBeGreaterThan(glow.geometryBytes)
    expect(hybrid.submittedVertices).toBeGreaterThan(glow.submittedVertices)
  })
})
