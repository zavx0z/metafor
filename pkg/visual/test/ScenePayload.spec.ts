import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {CenteredNested} from "../src/CenteredNested.ts"
import {OutsideIn} from "../src/OutsideIn.ts"
import {Visual} from "../src/Visual.ts"
import {
  buildVisualScenePayload,
  visualPayloadHermiteCurve,
  visualPayloadFieldParticleId,
  type VisualScenePayload,
} from "../src/ScenePayload.ts"
import {
  sampleHermiteEdgeCurve,
  writeHermiteEdgeSegments,
  type HermiteEdgeCurve,
} from "../src/HermiteEdge.ts"
import type {VisualLayout} from "../src/internal/layout.ts"
import {ladaLayoutInput as ladaInput} from "../testing/lada-fixture.ts"

const strategies: readonly VisualLayout[] = [CenteredNested, OutsideIn]

describe("Visual scene payload contract", () => {
  test("writes the reference Hermite samples straight into a Float32 segment buffer", () => {
    const curve: HermiteEdgeCurve = {
      from: {x: -3.25, y: 1.5, z: 0.75},
      fromTangent: {x: 2.5, y: -0.5, z: 8},
      to: {x: 11, y: -4.25, z: 2},
      toTangent: {x: -1.25, y: 3, z: -6},
    }
    const points = sampleHermiteEdgeCurve(curve)
    const expected = new Float32Array(64 * 6)
    let offset = 0
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]!
      const to = points[index]!
      expected.set([from.x, from.y, from.z, to.x, to.y, to.z], offset)
      offset += 6
    }
    const actual = new Float32Array(expected.length)

    expect(writeHermiteEdgeSegments(curve, actual)).toBe(actual.length)
    expect(actual).toEqual(expected)
  })

  test("exposes exactly the two named strategies through one contract", () => {
    expect(Visual.map((layout) => layout.slug).toSorted()).toEqual([
      "centered-nested",
      "outside-in",
    ])
    for (const layout of Visual) {
      expect(typeof layout.buildScene).toBe("function")
    }
  })

  for (const layout of strategies) {
    describe(layout.slug, () => {
      test("builds a complete payload for the real Lada snapshot", () => {
        const input = ladaInput()
        const payload = buildVisualScenePayload(layout, input)

        expect(payload.kind).toBe("visual-scene-payload")
        expect(payload.layoutSlug).toBe(layout.slug)
        expect(payload.tori.length).toBe(input.manifest.darkParticles.length)
        expect(payload.stats.rootSrc).toBe("zavx0z/lada")
        expect(payload.stats.darkParticleCount).toBe(
          input.manifest.darkParticles.length,
        )
        expect(payload.orbitals.length).toBe(
          input.manifest.orbitalParticles?.length ?? 0,
        )
        expect(payload.fieldProxies.length).toBe(
          input.manifest.fieldProxies?.length ?? 0,
        )
        expect(payload.tori.length).toBeGreaterThanOrEqual(5)
        expect(payload.fields.length).toBeGreaterThan(0)
        expect(payload.orbitals.length).toBeGreaterThan(23)
        expect(payload.transitionBatches.length).toBeGreaterThan(0)
      })

      test("stays serializable and free of browser or GPU resources", () => {
        const payload = buildVisualScenePayload(layout, ladaInput())
        const json = JSON.stringify(payload)

        expect(json).not.toContain("undefined")
        expect(JSON.parse(json)).toEqual(
          JSON.parse(JSON.stringify(payload)),
        )

        const forbidden = [
          "Renderer",
          "ViewPoint",
          "Space",
          "canvas",
          "GPUDevice",
          "GPUBuffer",
          "BufferGeometry",
        ]
        for (const name of forbidden) expect(json).not.toContain(name)

        const visit = (value: unknown, path: string): void => {
          if (value === null) return
          const type = typeof value
          if (type === "function" || type === "symbol" || type === "bigint") {
            throw new Error(`Payload ${path} is not serializable (${type})`)
          }
          if (type !== "object") return
          if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, `${path}[${index}]`))
            return
          }
          const prototype = Object.getPrototypeOf(value)
          expect(prototype === Object.prototype || prototype === null).toBe(true)
          for (const [key, item] of Object.entries(value as object)) {
            visit(item, `${path}.${key}`)
          }
        }
        visit(payload, "payload")
      })

      test("is deterministic across independent builds", () => {
        const first = buildVisualScenePayload(layout, ladaInput())
        const second = buildVisualScenePayload(layout, ladaInput())

        expect(JSON.stringify(second)).toBe(JSON.stringify(first))
        expect(second.transitionBatches.map((batch) => batch.fingerprint))
          .toEqual(first.transitionBatches.map((batch) => batch.fingerprint))
      })

      test("freezes every placement array against consumer mutation", () => {
        const payload = buildVisualScenePayload(layout, ladaInput())

        expect(Object.isFrozen(payload)).toBe(true)
        expect(Object.isFrozen(payload.tori)).toBe(true)
        expect(Object.isFrozen(payload.fields)).toBe(true)
        expect(Object.isFrozen(payload.orbitals)).toBe(true)
        expect(Object.isFrozen(payload.transitionBatches)).toBe(true)
      })

      test("expresses every position in the local frame of its owner", () => {
        const input = ladaInput()
        const scene = layout.buildScene(input)
        const payload = buildVisualScenePayload(layout, input)
        const worldTorusById = new Map(
          scene.tori.map((torus) => [torus.darkParticleId, torus] as const),
        )
        const payloadTorusById = new Map(
          payload.tori.map((torus) => [torus.darkParticleId, torus] as const),
        )

        for (const torus of payload.tori) {
          const world = worldTorusById.get(torus.darkParticleId)!
          if (torus.parentDarkParticleId === null) {
            expect(torus.localX).toBeCloseTo(world.x, 9)
            expect(torus.localY).toBeCloseTo(world.y, 9)
            expect(torus.localZ).toBeCloseTo(world.z, 9)
            continue
          }
          const parent = worldTorusById.get(torus.parentDarkParticleId)!
          expect(torus.localX).toBeCloseTo(world.x - parent.x, 9)
          expect(torus.localY).toBeCloseTo(world.y - parent.y, 9)
          expect(torus.localZ).toBeCloseTo(world.z - parent.z, 9)
          expect(payloadTorusById.has(torus.parentDarkParticleId)).toBe(true)
        }

        const worldOrbitalById = new Map(
          scene.orbitals.map((orbital) =>
            [orbital.orbitalParticleId, orbital] as const
          ),
        )
        for (const orbital of payload.orbitals) {
          const world = worldOrbitalById.get(orbital.orbitalParticleId)!
          const owner = worldTorusById.get(orbital.ownerDarkParticleId)!
          expect(orbital.localX).toBeCloseTo(world.x - owner.x, 9)
          expect(orbital.localY).toBeCloseTo(world.y - owner.y, 9)
          expect(orbital.localZ).toBeCloseTo(world.z - owner.z, 9)
        }
      })

      test("keeps package-owned mesh detail and material laws", () => {
        const payload = buildVisualScenePayload(layout, ladaInput())

        expect(payload.darkTorusMeshDetail).toEqual({
          radialSegments: 64,
          tubularSegments: 192,
        })
        expect(payload.embeddedTorusMeshDetail).toEqual({
          radialSegments: 32,
          tubularSegments: 192,
        })
        for (const torus of payload.tori) {
          expect(torus.material.form).toBe("torus")
          expect(torus.material.highlightSize).toBe(0)
          expect(torus.radius).toBeGreaterThan(0)
          expect(torus.tube).toBeGreaterThan(0)
        }
        for (const field of payload.fields) {
          expect(field.material.form).toBe("sphere")
          expect(field.material.highlightSize).toBe(1)
          expect(field.radius).toBeGreaterThan(0)
        }
        for (const value of [...payload.tori, ...payload.fields]) {
          for (const channel of value.material.color) {
            expect(channel).toBeGreaterThanOrEqual(0)
            expect(channel).toBeLessThanOrEqual(1)
          }
          expect(value.material.opacity).toBeGreaterThan(0)
          expect(value.material.opacity).toBeLessThanOrEqual(1)
        }
      })

      test("carries finite coordinates for every emitted shape and curve", () => {
        const payload = buildVisualScenePayload(layout, ladaInput())
        const finite = (value: number, label: string): void => {
          if (!Number.isFinite(value)) {
            throw new Error(`${label} is not finite: ${value}`)
          }
        }
        for (const torus of payload.tori) {
          finite(torus.localX, "torus.localX")
          finite(torus.localY, "torus.localY")
          finite(torus.localZ, "torus.localZ")
          finite(torus.radius, "torus.radius")
          finite(torus.tube, "torus.tube")
        }
        for (const batch of [
          ...payload.transitionBatches,
          ...payload.relationBatches,
        ]) {
          expect(batch.paths.length).toBeGreaterThan(0)
          for (const entry of batch.paths) {
            for (const curve of entry.curves) {
              expect(curve).toHaveLength(12)
              for (const coordinate of curve) {
                finite(coordinate, "curve coordinate")
              }
            }
          }
        }
      })

      test("carries compact Hermite curves and reconstructs reference resolution", () => {
        const payload = buildVisualScenePayload(layout, ladaInput())

        for (const batch of payload.transitionBatches) {
          for (const entry of batch.paths) {
            expect(entry.curves).toHaveLength(1)
            expect(sampleHermiteEdgeCurve(
              visualPayloadHermiteCurve(entry.curves[0]!),
            )).toHaveLength(65)
          }
        }
        for (const batch of payload.relationBatches) {
          for (const entry of batch.paths) {
            expect(entry.curves).toHaveLength(2)
            expect(entry.curves.flatMap((curve, curveIndex) =>
              sampleHermiteEdgeCurve(visualPayloadHermiteCurve(curve))
                .slice(curveIndex === 0 ? 0 : 1)
            )).toHaveLength(129)
          }
        }
        expect(JSON.stringify(payload)).not.toContain('"points"')
        const transitionBatchesByOwner = Map.groupBy(
          payload.transitionBatches,
          (batch) => batch.ownerDarkParticleId,
        )
        for (const batches of transitionBatchesByOwner.values()) {
          expect(batches.length).toBeLessThanOrEqual(4)
        }
      })

      test("covers each canonical identity exactly once", () => {
        const input = ladaInput()
        const payload = buildVisualScenePayload(layout, input)

        const torusIds = payload.tori.map((torus) => torus.darkParticleId)
        expect(new Set(torusIds).size).toBe(torusIds.length)
        expect(torusIds.toSorted()).toEqual(
          input.manifest.darkParticles
            .map((particle) => particle.darkParticleId)
            .toSorted(),
        )

        const orbitalIds = payload.orbitals.map((o) => o.orbitalParticleId)
        expect(new Set(orbitalIds).size).toBe(orbitalIds.length)

        const aliasSources = payload.fieldAliases.map((alias) =>
          alias.sourceFieldParticleId
        )
        expect(new Set(aliasSources).size).toBe(aliasSources.length)
        expect(aliasSources.toSorted()).toEqual(
          input.manifest.fieldParticles
            .map((field) => field.fieldParticleId)
            .toSorted(),
        )

        const visualFieldIds = new Set(
          payload.fields.map((field) => field.fieldParticleId),
        )
        for (const alias of payload.fieldAliases) {
          expect(visualFieldIds.has(alias.visualFieldParticleId)).toBe(true)
        }
        for (const proxy of payload.fieldProxies) {
          expect(visualFieldIds.has(proxy.visualFieldParticleId)).toBe(true)
        }
      })

      test("anchors every orbital and proxy inside an emitted owner", () => {
        const payload = buildVisualScenePayload(layout, ladaInput())
        const torusIds = new Set(
          payload.tori.map((torus) => torus.darkParticleId),
        )
        const stateIds = new Set(
          payload.orbitals
            .filter((orbital) => orbital.orbitalParticleKind === "state")
            .map((orbital) => orbital.orbitalParticleId),
        )

        for (const orbital of payload.orbitals) {
          expect(torusIds.has(orbital.ownerDarkParticleId)).toBe(true)
          if (orbital.orbitalParticleKind === "state") {
            expect(orbital.form.kind).toBe("torus")
            continue
          }
          expect(orbital.anchorStateOrbitalParticleId).not.toBeNull()
          expect(stateIds.has(orbital.anchorStateOrbitalParticleId!)).toBe(true)
        }
        for (const proxy of payload.fieldProxies) {
          expect(torusIds.has(proxy.ownerDarkParticleId)).toBe(true)
          expect(stateIds.has(proxy.stateOrbitalParticleId)).toBe(true)
        }
      })

      test("emits no Axion visual surface", () => {
        const payload = buildVisualScenePayload(layout, ladaInput())

        for (const torus of payload.tori) {
          expect(torus.darkParticleKind).not.toBe("axion")
        }
        for (const orbital of payload.orbitals) {
          expect(orbital.orbitalParticleKind).not.toBe("axion")
        }
      })
    })
  }

  test("gives the two strategies different geometry under one shape", () => {
    const input = ladaInput()
    const centered = buildVisualScenePayload(CenteredNested, input)
    const outside = buildVisualScenePayload(OutsideIn, input)

    expect(Object.keys(centered).toSorted())
      .toEqual(Object.keys(outside).toSorted())
    expect(centered.tori.map((torus) => torus.darkParticleId).toSorted())
      .toEqual(outside.tori.map((torus) => torus.darkParticleId).toSorted())
    expect(centered.layoutSlug).not.toBe(outside.layoutSlug)

    const centeredById = new Map(
      centered.tori.map((torus) => [torus.darkParticleId, torus] as const),
    )
    const moved = outside.tori.filter((torus) => {
      const other = centeredById.get(torus.darkParticleId)!
      return other.localX !== torus.localX ||
        other.localY !== torus.localY ||
        other.radius !== torus.radius
    })
    expect(moved.length).toBeGreaterThan(0)
  })

  test("namespaces synthetic Field identities per strategy and anchor", () => {
    expect(visualPayloadFieldParticleId("centered-nested", "a"))
      .not.toBe(visualPayloadFieldParticleId("outside-in", "a"))
    expect(visualPayloadFieldParticleId("centered-nested", "a"))
      .not.toBe(visualPayloadFieldParticleId("centered-nested", "b"))
    expect(visualPayloadFieldParticleId("centered-nested", "a"))
      .toBe(visualPayloadFieldParticleId("centered-nested", "a"))
  })

  test("rejects a scene whose owner is absent from the manifest", () => {
    const input = ladaInput()
    const truncated: BulkManifest = {
      ...input.manifest,
      darkParticles: input.manifest.darkParticles.slice(0, 1),
    }
    expect(() =>
      buildVisualScenePayload(CenteredNested, {
        ...input,
        manifest: truncated,
      })
    ).toThrow()
  })
})

export const ladaVisualPayload = (
  layout: VisualLayout = CenteredNested,
): VisualScenePayload => buildVisualScenePayload(layout, ladaInput())
