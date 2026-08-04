import {describe, expect, test} from "bun:test"
import {Color} from "@metafor/engine"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import {BulkVisualSceneLifecycle} from "bulk/visual"
import {visualFieldParticleColor} from "../src/SemanticVisual.ts"
import {resolveEmptyTorusForm} from "../src/Torus.ts"
import snapshotJson from "./fixture/monad-snapshot.json"
import {
  buildFieldsV2Source,
  createFieldsV2QuantumMaterial,
  fieldsV2AccretionColor,
  fieldsV2FieldText,
  fieldsV2TextSize,
  FIELDS_V2_EMPTY_FIELD_ENERGY,
  FIELDS_V2_EMPTY_FIELD_HIGHLIGHT_SIZE,
  FIELDS_V2_EMPTY_FIELD_OPACITY,
  FIELDS_V2_FIELD_KIND_ORDER,
  FIELDS_V2_FLOW_HEIGHT,
  FIELDS_V2_FLOW_RADIAL_AMPLITUDE,
  FIELDS_V2_MATERIALIZED_FIELD_ENERGY,
  FIELDS_V2_MATERIALIZED_FIELD_HIGHLIGHT_SIZE,
  FIELDS_V2_MATERIALIZED_FIELD_OPACITY,
  FIELDS_V2_RING_GAP,
  FIELDS_V2_RING_START_GAP,
  FIELDS_V2_RING_WIDTH,
  FIELDS_V2_RING_WIDTH_MAX,
  FIELDS_V2_RING_WIDTH_MIN,
  FIELDS_V2_TEXT_SIZE,
  layoutFieldsV2Rings,
} from "./FieldsV2Lab.ts"
import {
  createFlatFieldBandGeometry,
  deriveFieldsMattePastel,
  FIELDS_MATTE_DEFAULT_OPACITY,
  FIELDS_MATTE_TEXT_COLOR,
  updateFlatFieldBandGeometry,
} from "./FieldsMatte.ts"

describe("Fields v2 playground source", () => {
  test("keeps only root lada and its real Fields for the new layout", () => {
    const snapshot = snapshotJson as BulkObserverSnapshot
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshot))
    const projectionBefore = structuredClone(lifecycle.state().projection)

    const source = buildFieldsV2Source(lifecycle)

    expect(lifecycle.state().projection).toEqual(projectionBefore)
    expect(source.graph).toMatchObject({
      atomId: 2,
      atomLabel: "lada",
      src: snapshot.rootSrc,
      states: {length: 4},
      sleeves: {length: 5},
    })
    expect(source.manifest.rootSrc).toBe("zavx0z/lada")
    expect(source.manifest.darkParticles).toEqual([
      expect.objectContaining({
        darkParticleId: source.root.darkParticleId,
        label: "lada",
        parentDarkParticleId: null,
        src: "zavx0z/lada",
      }),
    ])
    expect(source.fields).toHaveLength(21)
    expect(source.fields).toEqual(source.manifest.fieldParticles)
    expect(source.fields.every((field) =>
      field.parentDarkParticleId === source.root.darkParticleId
    )).toBe(true)
    expect(source.manifest.orbitalParticles).toEqual([])
    expect(source.manifest.transitionChannels).toEqual([])
    expect(source.manifest.fieldProxies).toEqual([])
    expect(source.manifest.relationChannels).toEqual([])
    const standardRootForm = resolveEmptyTorusForm(0)
    expect(source.root.torusRadius).toBe(standardRootForm.radius)
    expect(source.root.torusTube).toBe(standardRootForm.tube)
    expect(
      (source.root.torusRadius - source.root.torusTube) * 2,
    ).toBeCloseTo(11.12)
    expect(
      (source.root.torusRadius + source.root.torusTube) * 2,
    ).toBe(100)
    expect(source.material.form).toBe("torus")

    const rings = layoutFieldsV2Rings(source.fields, 50)
    expect(rings).toHaveLength(source.fields.length)
    expect(FIELDS_V2_RING_GAP).toBe(0.5)
    expect(FIELDS_V2_RING_START_GAP).toBe(FIELDS_V2_RING_GAP)
    expect(rings[0]?.innerRadius).toBe(50 + FIELDS_V2_RING_START_GAP)
    const wideRings = layoutFieldsV2Rings(source.fields, 50, 4)
    expect(wideRings[0]!.outerRadius - wideRings[0]!.innerRadius).toBe(4)
    expect(
      wideRings[1]!.innerRadius - wideRings[0]!.outerRadius,
    ).toBe(FIELDS_V2_RING_GAP)
    expect(fieldsV2TextSize(4)).toBeCloseTo(
      FIELDS_V2_TEXT_SIZE * 4 / FIELDS_V2_RING_WIDTH,
    )
    expect(FIELDS_V2_FIELD_KIND_ORDER).toEqual([
      "number",
      "array",
      "string",
      "enum",
      "boolean",
      "other",
    ])
    const kindRank = new Map(FIELDS_V2_FIELD_KIND_ORDER.map(
      (kind, index) => [kind, index] as const,
    ))
    for (let index = 0; index < rings.length; index += 1) {
      expect(
        rings[index]!.outerRadius - rings[index]!.innerRadius,
      ).toBeCloseTo(FIELDS_V2_RING_WIDTH)
      if (index > 0) {
        expect(
          rings[index]!.innerRadius - rings[index - 1]!.outerRadius,
        ).toBeCloseTo(FIELDS_V2_RING_GAP)
        expect(
          kindRank.get(rings[index - 1]!.field.fieldParticleKind),
        ).toBeLessThanOrEqual(
          kindRank.get(rings[index]!.field.fieldParticleKind)!,
        )
      }
    }
    expect(fieldsV2FieldText(source.fields[0]!)).toBe("Телефон Лады · ∅")
    expect(fieldsV2FieldText(source.fields[2]!)).toBe("Авторизована · true")
    expect(FIELDS_V2_FLOW_RADIAL_AMPLITUDE).toBeLessThan(FIELDS_V2_RING_GAP / 2)
    expect(FIELDS_V2_FLOW_HEIGHT).toBeLessThan(FIELDS_V2_RING_GAP / 2)
    expect(FIELDS_V2_EMPTY_FIELD_OPACITY).toBeLessThan(
      FIELDS_V2_MATERIALIZED_FIELD_OPACITY,
    )
    expect(FIELDS_V2_MATERIALIZED_FIELD_OPACITY).toBeLessThanOrEqual(0.5)
    expect(FIELDS_V2_EMPTY_FIELD_HIGHLIGHT_SIZE).toBeLessThan(
      FIELDS_V2_MATERIALIZED_FIELD_HIGHLIGHT_SIZE,
    )
    const emptyField = source.fields[0]!
    const semanticColor = visualFieldParticleColor(emptyField)
    const emptyColor = fieldsV2AccretionColor(emptyField)
    const materializedColor = fieldsV2AccretionColor(
      {...emptyField, valueText: "ready"},
    )
    const emptyQuantum = createFieldsV2QuantumMaterial(
      emptyField,
      new Color(...emptyColor),
    )
    const materializedQuantum = createFieldsV2QuantumMaterial(
      {...emptyField, valueText: "ready"},
      new Color(...materializedColor),
    )
    expect(emptyColor).toEqual([
      semanticColor[0] * FIELDS_V2_EMPTY_FIELD_ENERGY,
      semanticColor[1] * FIELDS_V2_EMPTY_FIELD_ENERGY,
      semanticColor[2] * FIELDS_V2_EMPTY_FIELD_ENERGY,
    ])
    expect(materializedColor).toEqual([
      semanticColor[0] * FIELDS_V2_MATERIALIZED_FIELD_ENERGY,
      semanticColor[1] * FIELDS_V2_MATERIALIZED_FIELD_ENERGY,
      semanticColor[2] * FIELDS_V2_MATERIALIZED_FIELD_ENERGY,
    ])
    expect(emptyColor.every((channel) => channel >= 0 && channel <= 1)).toBe(true)
    expect(
      materializedColor.reduce((sum, channel) => sum + channel, 0),
    ).toBeGreaterThan(emptyColor.reduce((sum, channel) => sum + channel, 0))
    expect(emptyQuantum.opacity).toBe(FIELDS_V2_EMPTY_FIELD_OPACITY)
    expect(emptyQuantum.highlightSize).toBe(FIELDS_V2_EMPTY_FIELD_HIGHLIGHT_SIZE)
    expect(emptyQuantum.rimStrength).toBeLessThan(materializedQuantum.rimStrength)
    expect(materializedQuantum.opacity).toBe(FIELDS_V2_MATERIALIZED_FIELD_OPACITY)
    expect(materializedQuantum.highlightSize).toBe(
      FIELDS_V2_MATERIALIZED_FIELD_HIGHLIGHT_SIZE,
    )
  })

  test("renders only the lada Torus and starts the camera on its top axis", async () => {
    const source = await Bun.file(
      new URL("./FieldsV2Lab.ts", import.meta.url),
    ).text()

    expect(source).toContain("new TorusGeometry({")
    expect(source).toContain("resolveEmptyTorusForm(0)")
    expect(source).toContain("createFlatFieldBandGeometry(")
    expect(source).toContain("updateFlatFieldBandGeometry(")
    expect(source).toContain('widthInput.id = "fields-v2-ring-width"')
    expect(source).toContain("sceneOuterRadius = updateFields(ringWidth)")
    expect(source).toContain(
      "const textScale = fieldsV2TextSize(nextRingWidth) / FIELDS_V2_TEXT_SIZE",
    )
    expect(source).toContain("position.needsUpdate = true")
    expect(source).not.toContain("clearFields")
    expect(source).not.toContain(
      "sceneOuterRadius = updateFields(ringWidth)\n    warmupFrames = 1\n    resetTopView()",
    )
    expect(FIELDS_V2_RING_WIDTH_MIN).toBe(1.2)
    expect(FIELDS_V2_RING_WIDTH_MAX).toBe(10)
    expect(source).toContain("new MeshBasicMaterial({")
    expect(source).toContain("deriveFieldsMattePastel(")
    expect(source).not.toContain("MeshLambertMaterial")
    expect(source).not.toContain("new Light(")
    expect(source).toContain("bendFieldsV2TextGeometryToRing(")
    expect(source).toContain("near: 1")
    expect(source).toContain("far: 10000")
    expect(source).toContain("textOverlay.add(fieldText)")
    expect(source).toContain(
      "renderer.renderFrame(space, textOverlay, viewPoint)",
    )
    expect(source).toContain("warmupFrames = 1")
    expect(source).toContain(
      "position: {x: 0, y: 0, z: sceneOuterRadius * 2.35}",
    )
    expect(source).toContain("viewPoint.getUp().set(0, 1, 0)")
    expect(source).not.toContain("SphereGeometry")
  })

  test("uses the shared flat matte Fields law", () => {
    const geometry = createFlatFieldBandGeometry(5, 8, 32)
    const positions = geometry.attributes.position!.array
    for (let index = 2; index < positions.length; index += 3) {
      expect(positions[index]).toBe(0)
    }
    updateFlatFieldBandGeometry(geometry, 7, 11)
    expect(Math.hypot(positions[0]!, positions[1]!)).toBeCloseTo(7)
    expect(Math.hypot(positions[3]!, positions[4]!)).toBeCloseTo(11)

    const pastel = deriveFieldsMattePastel(
      new Color(1, 0.08, 0.58),
      FIELDS_MATTE_DEFAULT_OPACITY,
    )
    expect(pastel.g).toBeGreaterThan(0.08)
    expect(pastel.a).toBeCloseTo(0.3025)
    expect(FIELDS_MATTE_TEXT_COLOR).toBe(0x000000)
  })
})
