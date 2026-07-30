import {describe, expect, test} from "bun:test"
import {
  METAFOR_TORUS_DEFAULTS,
  MAX_TORUS_WIDTH_MM,
  THREE_TORUS_DEFAULTS,
  applyMetaForTorusParameter,
  applyShiftRangePrecision,
  buildThreeTorusWireGeometry,
  constrainThreeTorusWidth,
  deriveMetaForTorusParameters,
  mergeTorusDefaults,
  readStoredTorusDefaults,
  torusCameraFitDistance,
} from "./TorusAnalysisLab.ts"

describe("Torus Analysis Lab", () => {
  test("documents every standard parameter in Russian inside the scene", async () => {
    const page = await Bun.file(
      new URL("./index.html", import.meta.url),
    ).text()
    const parameters = [
      "radius",
      "tube",
      "radialSegments",
      "tubularSegments",
      "arc",
      "thetaStart",
      "thetaLength",
    ]

    for (const parameter of parameters) {
      expect(page).toContain(`Описание параметра ${parameter}`)
      expect(page).toContain(`<strong>${parameter} —`)
      expect(page).toContain(`data-torus-our-default="${parameter}"`)
    }
    expect(page.match(/class="torus-three-default"/g)?.length).toBe(7)
    expect(page.match(/class="torus-our-default"/g)?.length).toBe(7)
  })

  test("keeps the official Three.js TorusGeometry defaults", () => {
    expect(THREE_TORUS_DEFAULTS).toEqual({
      radius: 1,
      tube: 0.4,
      radialSegments: 12,
      tubularSegments: 48,
      arc: Math.PI * 2,
      thetaStart: 0,
      thetaLength: Math.PI * 2,
    })
  })

  test("starts MetaFor defaults from the approved current scene", () => {
    expect(METAFOR_TORUS_DEFAULTS).toEqual({
      radius: 27.78,
      tube: 22.22,
      radialSegments: 64,
      tubularSegments: 192,
      arc: 6.28,
      thetaStart: -0.003,
      thetaLength: 6.28,
    })
  })

  test("restores only finite editable MetaFor defaults", () => {
    expect(mergeTorusDefaults({
      radius: 1.35,
      tube: Number.NaN,
      radialSegments: "40",
    })).toEqual({
      ...METAFOR_TORUS_DEFAULTS,
      radius: 1.35,
    })
  })

  test("reads the fixed browser defaults for other playground labs", () => {
    const stored = readStoredTorusDefaults({
      getItem: () => JSON.stringify({
        radius: 18,
        tube: 7,
        radialSegments: 32,
        tubularSegments: 72,
      }),
    })

    expect(stored).toEqual({
      ...METAFOR_TORUS_DEFAULTS,
      radius: 18,
      tube: 7,
      radialSegments: 32,
      tubularSegments: 72,
    })
  })

  test("derives MetaFor diameters in millimetres from Three.js parameters", () => {
    const derived = deriveMetaForTorusParameters({
      radius: 1.1,
      tube: 0.7,
    })

    expect(derived.innerDiameter).toBeCloseTo(0.8)
    expect(derived.tubeDiameter).toBeCloseTo(1.4)
  })

  test("changes the tube diameter without changing the inner diameter", () => {
    const input = {...METAFOR_TORUS_DEFAULTS}
    const changed = applyMetaForTorusParameter(input, "tubeDiameter", 2)

    expect(changed.radius).toBeCloseTo(6.56)
    expect(changed.tube).toBeCloseTo(1)
    const derived = deriveMetaForTorusParameters(changed)
    expect(derived.innerDiameter).toBeCloseTo(11.12)
    expect(derived.tubeDiameter).toBeCloseTo(2)
  })

  test("changes the inner diameter without changing the outer diameter", () => {
    const input = {...METAFOR_TORUS_DEFAULTS}
    const outerDiameter = (input.radius + input.tube) * 2
    const changed = applyMetaForTorusParameter(input, "innerDiameter", 1.2)

    expect(changed.radius).toBeCloseTo(25.3)
    expect(changed.tube).toBeCloseTo(24.7)
    expect((changed.radius + changed.tube) * 2).toBeCloseTo(outerDiameter)
    const derived = deriveMetaForTorusParameters(changed)
    expect(derived.innerDiameter).toBeCloseTo(1.2)
    expect(derived.tubeDiameter).toBeCloseTo(49.4)
  })

  test("exposes only the two agreed MetaFor diameter controls", async () => {
    const page = await Bun.file(
      new URL("./index.html", import.meta.url),
    ).text()

    expect(page).toContain('id="torus-analysis-inner-diameter"')
    expect(page).toContain('id="torus-analysis-tube-diameter"')
    expect(page).toContain("Внутренний диаметр")
    expect(page).toContain("Диаметр трубки")
    expect(page).toContain("одна единица")
    expect(page).toContain("одному миллиметру")
    expect(page).toContain("Ширина формы")
    expect(page).toContain("Высота формы")
    expect(page).toContain('id="torus-analysis-form-width-output"')
    expect(page).toContain('id="torus-analysis-form-height-output"')
    expect(page).not.toContain('id="torus-analysis-height"')
    expect(page).not.toContain('id="torus-analysis-outer-radius"')
  })

  test("does not quantize the coupled Three.js radius and tube values", async () => {
    const page = await Bun.file(
      new URL("./index.html", import.meta.url),
    ).text()

    expect(page).toContain(
      'id="torus-analysis-radius" type="range" min="0.2" max="49.95" step="any"',
    )
    expect(page).toContain(
      'id="torus-analysis-tube" type="range" min="0.05" max="49.8" step="any"',
    )
  })

  test("allows both MetaFor dimensions up to 100 millimetres", async () => {
    const page = await Bun.file(
      new URL("./index.html", import.meta.url),
    ).text()

    expect(page).toMatch(
      /id="torus-analysis-inner-diameter"[\s\S]*?max="100"/,
    )
    expect(page).toMatch(
      /id="torus-analysis-tube-diameter"[\s\S]*?max="100"/,
    )
  })

  test("increases the required camera distance with the outer radius", () => {
    expect(torusCameraFitDistance({radius: 1.1, tube: 0.7}))
      .toBeCloseTo(13.2)
    expect(torusCameraFitDistance({radius: 25, tube: 25}))
      .toBeCloseTo(220)
  })

  test("caps a MetaFor tube diameter at 100 millimetres form width", () => {
    const changed = applyMetaForTorusParameter(
      {...METAFOR_TORUS_DEFAULTS},
      "tubeDiameter",
      100,
    )

    expect((changed.radius + changed.tube) * 2)
      .toBeCloseTo(MAX_TORUS_WIDTH_MM)
    expect(deriveMetaForTorusParameters(changed).innerDiameter)
      .toBeCloseTo(11.12)
  })

  test("keeps direct Three.js size edits within 100 millimetres", () => {
    const radiusChanged = constrainThreeTorusWidth({
      ...THREE_TORUS_DEFAULTS,
      radius: 49.95,
      tube: 1,
    }, "radius")
    const tubeChanged = constrainThreeTorusWidth({
      ...THREE_TORUS_DEFAULTS,
      radius: 2,
      tube: 49.8,
    }, "tube")

    expect((radiusChanged.radius + radiusChanged.tube) * 2)
      .toBeCloseTo(MAX_TORUS_WIDTH_MM)
    expect((tubeChanged.radius + tubeChanged.tube) * 2)
      .toBeCloseTo(MAX_TORUS_WIDTH_MM)
  })

  test("slows continuous range movement tenfold while Shift is held", () => {
    expect(applyShiftRangePrecision(10, 20, true)).toBeCloseTo(11)
    expect(applyShiftRangePrecision(10, 20, false)).toBeCloseTo(20)
    expect(applyShiftRangePrecision(10, 0, true)).toBeCloseTo(9)
  })

  test("uses unquantized ranges for Shift precision controls", async () => {
    const page = await Bun.file(
      new URL("./index.html", import.meta.url),
    ).text()
    const continuousParameters = [
      "radius",
      "tube",
      "arc",
      "theta-start",
      "theta-length",
      "inner-diameter",
      "tube-diameter",
    ]

    for (const parameter of continuousParameters) {
      expect(page).toMatch(
        new RegExp(
          String.raw`id="torus-analysis-${parameter}"[\s\S]*?step="any"`,
        ),
      )
    }
    expect(page).toContain("Shift при перетаскивании")
    expect(page).toContain("в 10 раз медленнее")
  })

  test("builds the exact standard grid and derived primitive counts", () => {
    const result = buildThreeTorusWireGeometry(THREE_TORUS_DEFAULTS)

    expect(result.vertices).toBe((12 + 1) * (48 + 1))
    expect(result.triangles).toBe(12 * 48 * 2)
    expect(result.lineSegments).toBe((12 + 1) * 48 + 12 * (48 + 1))
    expect(result.geometry.attributes.position?.count)
      .toBe(result.lineSegments * 2)
  })

  test("applies partial arc and cross-section sweep to generated vertices", () => {
    const result = buildThreeTorusWireGeometry({
      ...THREE_TORUS_DEFAULTS,
      arc: Math.PI,
      thetaStart: Math.PI / 2,
      thetaLength: Math.PI,
    })
    const positions = result.geometry.attributes.position?.array

    expect(positions?.[0]).toBeCloseTo(1)
    expect(positions?.[1]).toBeCloseTo(0)
    expect(positions?.[2]).toBeCloseTo(0.4)
  })
})
