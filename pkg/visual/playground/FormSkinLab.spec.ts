import {describe, expect, test} from "bun:test"
import {Color} from "@metafor/engine"
import {
  FORM_SKIN_GEOMETRY,
  FORM_SKINS,
  buildFormGeometry,
  deriveFormSkinPalette,
  measureFormSkinLoad,
} from "./FormSkinLab.ts"
import {
  createFlatFieldBandGeometry,
  deriveFieldsMattePastel,
  FIELDS_MATTE_TEXT_COLOR,
} from "./FieldsMatte.ts"

describe("Form Skin Lab", () => {
  test("offers the same skin catalog to Sphere and Torus geometry", () => {
    expect(FORM_SKINS.map((skin) => skin.id)).toEqual([
      "quantum",
      "holographic",
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
    expect(buildFormGeometry("fields", 24, 8, 0.28).mesh.index?.count)
      .toBeGreaterThan(0)
  })

  test("routes Fields through the same Form Skin interface", async () => {
    const [client, page, source] = await Promise.all([
      Bun.file(new URL("./client.ts", import.meta.url)).text(),
      Bun.file(new URL("./index.html", import.meta.url)).text(),
      Bun.file(new URL("./FormSkinLab.ts", import.meta.url)).text(),
    ])

    expect(client).toContain('if (slug === "skin-fields") return "fields"')
    expect(client).toContain('fieldsSkinLink.textContent = "Fields"')
    expect(source).toContain('export type FormSkinLabForm = "sphere" | "torus" | "fields"')
    expect(source).toContain('"Fields · скины формы"')
    expect(source).toContain('"WebGPU · one-pass holographic"')
    expect(source).toContain("activeGeometries = placements.map")
    expect(source).toContain("fieldsV2AccretionColor(placement.field)")
    expect(source).toContain('if (form === "fields") elements.select.value = "solid"')
    expect(source).toContain('const mesh = skinId === "solid"')
    expect(source).toContain("createFieldsV2QuantumMaterial(field, color)")
    expect(page).not.toContain("holographic-skin-stage")
  })

  test("keeps form geometry fixed outside the skin controls", async () => {
    expect(FORM_SKIN_GEOMETRY).toEqual({
      detail: 48,
      size: 8,
      torusRadialSegments: 64,
      torusTubularSegments: 192,
      tubeRatio: 0.28,
    })
    const [page, source] = await Promise.all([
      Bun.file(new URL("./index.html", import.meta.url)).text(),
      Bun.file(new URL("./FormSkinLab.ts", import.meta.url)).text(),
    ])

    expect(page).not.toContain("form-skin-detail")
    expect(page).not.toContain("form-skin-size")
    expect(page).not.toContain("form-skin-tube")
    expect(page).not.toContain("form-skin-animation")
    expect(page).toContain('<span>Цвет</span>')
    expect(page).not.toContain("form-skin-highlight-color")
    expect(page).toContain("form-skin-highlight-size")
    expect(page).toContain("Размер бликов")
    expect(page).toContain(
      'id="form-skin-highlight-size" type="range" min="0" max="1" step="0.05" value="1"',
    )
    expect(source).toContain("createQuantumSphereMaterial")
    expect(source).toContain("form === \"sphere\"")
    expect(source).toContain("SPHERE_QUANTUM_HIGHLIGHT_SIZE")
    expect(page).toContain("form-skin-run-current")
    expect(page).toContain("form-skin-run-all")

    const torus = buildFormGeometry("torus", 48, 8, 0.28, {
      radial: FORM_SKIN_GEOMETRY.torusRadialSegments,
      tubular: FORM_SKIN_GEOMETRY.torusTubularSegments,
    })
    expect(torus.mesh.index?.count).toBe(
      FORM_SKIN_GEOMETRY.torusRadialSegments *
      FORM_SKIN_GEOMETRY.torusTubularSegments *
      6,
    )
  })

  test("derives film and glow tones from one selected color", () => {
    const selected = new Color(0.2, 0.6, 0.9)
    const palette = deriveFormSkinPalette(selected, 0.55)

    expect(palette.film.r).toBeCloseTo(selected.r * 0.42)
    expect(palette.film.g).toBeCloseTo(selected.g * 0.42)
    expect(palette.film.b).toBeCloseTo(selected.b * 0.42)
    expect(palette.film.a).toBe(0.55)
    expect(palette.glow.r).toBeGreaterThan(selected.r)
    expect(palette.glow.g).toBeGreaterThan(selected.g)
    expect(palette.glow.b).toBeGreaterThan(selected.b)
  })

  test("makes solid Fields flat, pastel and actually transparent", () => {
    const geometry = createFlatFieldBandGeometry(4, 6, 24)
    const positions = geometry.attributes.position!.array
    for (let index = 2; index < positions.length; index += 3) {
      expect(positions[index]).toBe(0)
    }
    expect(Math.hypot(positions[0]!, positions[1]!)).toBeCloseTo(4)
    expect(Math.hypot(positions[3]!, positions[4]!)).toBeCloseTo(6)

    const source = new Color(1, 0.08, 0.58)
    const pastel = deriveFieldsMattePastel(source, 0.55)
    expect(pastel.r).toBe(source.r)
    expect(pastel.g).toBeGreaterThan(source.g)
    expect(pastel.b).toBeGreaterThan(source.b)
    expect(pastel.a).toBeCloseTo(0.3025)
    expect(FIELDS_MATTE_TEXT_COLOR).toBe(0x000000)
  })

  test("reports exact pass multiplication and shared geometry cost", () => {
    const geometry = buildFormGeometry("sphere", 24, 8, 0.28)
    const quantum = measureFormSkinLoad(geometry, "quantum", 3)
    const holographic = measureFormSkinLoad(geometry, "holographic", 3)
    const glow = measureFormSkinLoad(geometry, "glow", 3)
    const hybrid = measureFormSkinLoad(geometry, "hybrid", 3)

    expect(quantum.drawCalls).toBe(3)
    expect(quantum.passesPerForm).toBe(1)
    expect(quantum.renderObjects).toBe(3)
    expect(quantum.triangles).toBeGreaterThan(0)
    expect(quantum.lineSegments).toBe(0)
    expect(holographic.drawCalls).toBe(3)
    expect(holographic.passesPerForm).toBe(1)
    expect(holographic.renderObjects).toBe(3)
    expect(holographic.triangles).toBeGreaterThan(0)
    expect(holographic.lineSegments).toBe(0)
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
