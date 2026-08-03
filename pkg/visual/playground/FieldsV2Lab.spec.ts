import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import {BulkVisualSceneLifecycle} from "bulk/visual"
import {resolveEmptyTorusForm} from "../src/Torus.ts"
import snapshotJson from "./fixture/monad-snapshot.json"
import {
  buildFieldsV2Source,
  fieldsV2FieldText,
  FIELDS_V2_RING_GAP,
  FIELDS_V2_RING_START_GAP,
  FIELDS_V2_RING_WIDTH,
  layoutFieldsV2Rings,
} from "./FieldsV2Lab.ts"

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
    for (let index = 0; index < rings.length; index += 1) {
      expect(rings[index]?.field).toBe(source.fields[index])
      expect(
        rings[index]!.outerRadius - rings[index]!.innerRadius,
      ).toBeCloseTo(FIELDS_V2_RING_WIDTH)
      if (index > 0) {
        expect(
          rings[index]!.innerRadius - rings[index - 1]!.outerRadius,
        ).toBeCloseTo(FIELDS_V2_RING_GAP)
      }
    }
    expect(fieldsV2FieldText(source.fields[0]!)).toBe("Телефон Лады · ∅")
    expect(fieldsV2FieldText(source.fields[2]!)).toBe("Авторизована · true")
  })

  test("renders only the lada Torus and starts the camera on its top axis", async () => {
    const source = await Bun.file(
      new URL("./FieldsV2Lab.ts", import.meta.url),
    ).text()

    expect(source).toContain("new TorusGeometry({")
    expect(source).toContain("resolveEmptyTorusForm(0)")
    expect(source).toContain("createAnnulusGeometry(")
    expect(source).toContain("bendTextGeometryToRing(")
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
})
