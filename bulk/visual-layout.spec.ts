import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {
  BulkManifest,
  BulkRenderDarkParticle,
} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import snapshotJson from "./fixture/monad-snapshot.json"
import {buildBulkManifestation} from "./manifestation.ts"
import {BulkProjectionStore} from "./projection.ts"
import {BulkSceneStore} from "./scene.ts"
import {buildBulkVisualRenderManifest} from "./visual-layout.ts"
import {assertBulkVisualProjectionBoundary} from "./web/visual-projection.ts"

const fullFixture = (): Readonly<{
  manifest: BulkManifest
  projection: BulkRuntimeProjection
}> => {
  const snapshot = snapshotJson as BulkObserverSnapshot
  const store = new BulkProjectionStore()
  store.hydrate(structuredClone(snapshot.projection))
  const projection = store.view()
  return {
    manifest: buildBulkManifestation(projection, snapshot.rootSrc),
    projection,
  }
}

const worldCenters = (
  particles: readonly BulkRenderDarkParticle[],
): ReadonlyMap<number, Readonly<{x: number; y: number; z: number}>> => {
  const byId = new Map(particles.map((particle) =>
    [particle.darkParticleId, particle] as const
  ))
  const centers = new Map<
    number,
    Readonly<{x: number; y: number; z: number}>
  >()
  const visiting = new Set<number>()
  const resolve = (
    particle: BulkRenderDarkParticle,
  ): Readonly<{x: number; y: number; z: number}> => {
    const cached = centers.get(particle.darkParticleId)
    if (cached) return cached
    if (visiting.has(particle.darkParticleId)) {
      throw new Error(`Dark cycle ${particle.darkParticleId}`)
    }
    visiting.add(particle.darkParticleId)
    const parent = particle.parentDarkParticleId === null
      ? null
      : byId.get(particle.parentDarkParticleId)
    if (particle.parentDarkParticleId !== null && !parent) {
      throw new Error(`Missing Dark parent ${particle.parentDarkParticleId}`)
    }
    const parentCenter = parent ? resolve(parent) : {x: 0, y: 0, z: 0}
    const center = {
      x: parentCenter.x + particle.localX,
      y: parentCenter.y + particle.localY,
      z: parentCenter.z + particle.localZ,
    }
    visiting.delete(particle.darkParticleId)
    centers.set(particle.darkParticleId, center)
    return center
  }
  for (const particle of particles) resolve(particle)
  return centers
}

const expectEmptyPatch = (
  patch: ReturnType<BulkSceneStore["apply"]>,
): void => {
  for (const value of Object.values(patch)) expect(value).toHaveLength(0)
}

const withoutKeys = (
  value: object,
  keys: ReadonlySet<string>,
): Record<string, unknown> => Object.fromEntries(
  Object.entries(value).filter(([key]) => !keys.has(key)),
)

describe("centered-nested Bulk Visual projection", () => {
  test("projects the full Bulk scene without mutating canonical identity", () => {
    const {manifest, projection} = fullFixture()
    const manifestBefore = structuredClone(manifest)
    const projectionBefore = structuredClone(projection)

    const visual = buildBulkVisualRenderManifest(
      manifest,
      projection,
    )
    expect(() => assertBulkVisualProjectionBoundary(visual)).not.toThrow()

    expect(manifest).toEqual(manifestBefore)
    expect(projection).toEqual(projectionBefore)
    expect(visual).not.toHaveProperty("sourceManifest")
    expect(visual.sourceStats).toEqual({
      rootSrc: manifest.rootSrc,
      darkParticleCount: manifest.darkParticles.length,
      fieldParticleCount: manifest.fieldParticles.length,
      orbitalParticleCount: manifest.orbitalParticles?.length ?? 0,
      transitionChannelCount: manifest.transitionChannels?.length ?? 0,
    })
    expect(visual.layoutSlug).toBe("centered-nested")
    expect(visual.darkTorusMeshDetail).toEqual({
      radialSegments: 64,
      tubularSegments: 192,
    })
    expect(visual.embeddedTorusMeshDetail).toEqual({
      radialSegments: 32,
      tubularSegments: 192,
    })
    expect(manifest.darkParticles).toHaveLength(5)
    expect(manifest.fieldParticles).toHaveLength(54)
    expect(manifest.orbitalParticles).toHaveLength(193)
    expect(manifest.transitionChannels).toHaveLength(165)
    expect(manifest.fieldProxies).toHaveLength(864)
    expect(manifest.relationChannels).toHaveLength(1928)
    expect(visual.manifest.darkParticles).toHaveLength(5)
    expect(visual.manifest.fieldParticles).toHaveLength(28)
    expect(visual.manifest.orbitalParticles).toHaveLength(193)
    expect(visual.manifest.transitionChannels).toHaveLength(165)
    expect(visual.manifest.fieldProxies).toHaveLength(864)
    expect(visual.manifest.relationChannels).toHaveLength(1902)
    expect(visual.fieldAliases).toHaveLength(54)
    expect(visual.orbitalTori).toHaveLength(
      (manifest.orbitalParticles ?? []).filter((particle) =>
        particle.orbitalParticleKind === "state" ||
        particle.orbitalParticleKind === "process" ||
        particle.orbitalParticleKind === "finally"
      ).length,
    )
    for (const paths of [visual.transitionPaths, visual.relationPaths]) {
      const fingerprintByBatchId = new Map<string, string>()
      for (const path of paths) {
        expect(path.batchFingerprint).toMatch(/^[0-9a-f]{16}$/)
        const existing = fingerprintByBatchId.get(path.batchId)
        if (existing === undefined) {
          fingerprintByBatchId.set(path.batchId, path.batchFingerprint)
        } else {
          expect(path.batchFingerprint).toBe(existing)
        }
      }
    }

    expect(new Set(visual.fieldAliases.map((alias) =>
      alias.sourceFieldParticleId
    ))).toEqual(new Set(manifest.fieldParticles.map((field) =>
      field.fieldParticleId
    )))
    expect(new Set(visual.orbitalTori.map((torus) =>
      torus.orbitalParticleId
    ))).toEqual(new Set(
      manifest.orbitalParticles
        ?.filter((particle) =>
          particle.orbitalParticleKind === "state" ||
          particle.orbitalParticleKind === "process" ||
          particle.orbitalParticleKind === "finally"
        )
        .map((particle) => particle.orbitalParticleId),
    ))
    expect(new Set(visual.manifest.transitionChannels?.map((channel) =>
      channel.transitionChannelId
    ))).toEqual(new Set(manifest.transitionChannels?.map((channel) =>
      channel.transitionChannelId
    )))
    const renderedSourceRelations = (manifest.relationChannels ?? []).filter(
      (channel) => channel.relationKind !== "field-entanglement",
    )
    expect(new Set(visual.manifest.relationChannels?.map((channel) =>
      channel.relationChannelId
    ))).toEqual(new Set(renderedSourceRelations.map((channel) =>
      channel.relationChannelId
    )))
    expect(visual.manifest.transitionChannels.map((channel) =>
      withoutKeys(channel, new Set(["colorR", "colorG", "colorB"]))
    )).toEqual((manifest.transitionChannels ?? []).map((channel) =>
      withoutKeys(channel, new Set())
    ))
    for (
      let index = 0;
      index < (manifest.transitionChannels?.length ?? 0);
      index++
    ) {
      const source = manifest.transitionChannels![index]!
      const projected = visual.manifest.transitionChannels![index]!
      expect(projected).not.toBe(source)
      expect(projected.conditionIds).not.toBe(source.conditionIds)
      expect(projected.conditionFieldIds)
        .not.toBe(source.conditionFieldIds)
    }
    const aliasBySourceFieldId = new Map(visual.fieldAliases.map((alias) =>
      [alias.sourceFieldParticleId, alias.visualFieldParticleId] as const
    ))
    const visualFieldId = (sourceId: string): string => {
      const id = aliasBySourceFieldId.get(sourceId)
      if (!id) throw new Error(`Missing test Field alias ${sourceId}`)
      return id
    }
    expect(visual.manifest.relationChannels.map((channel) =>
      withoutKeys(channel, new Set(["colorR", "colorG", "colorB"]))
    )).toEqual(
      renderedSourceRelations.map((channel) => ({
        ...channel,
        fromId: channel.fromKind === "field"
          ? visualFieldId(channel.fromId)
          : channel.fromId,
        toId: channel.toKind === "field"
          ? visualFieldId(channel.toId)
          : channel.toId,
      })),
    )
    for (
      let index = 0;
      index < renderedSourceRelations.length;
      index++
    ) {
      expect(visual.manifest.relationChannels![index])
        .not.toBe(renderedSourceRelations[index])
    }
    const sourceDarkById = new Map(manifest.darkParticles.map((particle) =>
      [particle.darkParticleId, particle] as const
    ))
    for (const projected of visual.manifest.darkParticles) {
      expect(projected).not.toBe(
        sourceDarkById.get(projected.darkParticleId),
      )
      expect(withoutKeys(
        projected,
        new Set([
          "localX",
          "localY",
          "localZ",
          "colorR",
          "colorG",
          "colorB",
          "torusRadius",
          "torusTube",
        ]),
      )).toEqual(withoutKeys(
        sourceDarkById.get(projected.darkParticleId)!,
        new Set([
          "localX",
          "localY",
          "localZ",
          "colorR",
          "colorG",
          "colorB",
          "torusRadius",
          "torusTube",
        ]),
      ))
    }
    const sourceOrbitalById = new Map(
      manifest.orbitalParticles?.map((particle) =>
        [particle.orbitalParticleId, particle] as const
      ),
    )
    for (const projected of visual.manifest.orbitalParticles ?? []) {
      const source = sourceOrbitalById.get(projected.orbitalParticleId)!
      expect(projected).not.toBe(source)
      expect(projected.relatedStateIds).not.toBe(source.relatedStateIds)
      expect(projected.relatedStateIds).toEqual(source.relatedStateIds)
      expect(withoutKeys(
        projected,
        new Set([
          "colorB",
          "colorG",
          "colorR",
          "localX",
          "localY",
          "localZ",
        ]),
      )).toEqual(withoutKeys(
        source,
        new Set([
          "colorB",
          "colorG",
          "colorR",
          "localX",
          "localY",
          "localZ",
        ]),
      ))
    }
    const sourceProxyById = new Map(manifest.fieldProxies?.map((proxy) =>
      [proxy.fieldProxyId, proxy] as const
    ))
    for (const projected of visual.manifest.fieldProxies ?? []) {
      const source = sourceProxyById.get(projected.fieldProxyId)!
      expect(projected).not.toBe(source)
      expect(withoutKeys(
        projected,
        new Set([
          "fieldParticleId",
          "colorB",
          "colorG",
          "colorR",
          "localX",
          "localY",
          "localZ",
        ]),
      )).toEqual(withoutKeys(
        source,
        new Set([
          "fieldParticleId",
          "colorB",
          "colorG",
          "colorR",
          "localX",
          "localY",
          "localZ",
        ]),
      ))
    }

    const sharedVisualMarkers = Map.groupBy(
      visual.fieldAliases,
      (alias) => alias.visualFieldParticleId,
    )
    expect([...sharedVisualMarkers.values()].some((aliases) =>
      new Set(aliases.map((alias) =>
        alias.sourceParentDarkParticleId
      )).size > 1
    )).toBe(true)
    expect(visual.manifest.fieldParticles.every((field) =>
      field.fieldParticleId.startsWith(
        "visual:centered-nested:field:",
      )
    )).toBe(true)

    const centers = [...worldCenters(
      visual.manifest.darkParticles,
    ).values()]
    const first = centers[0]!
    expect(centers.every((center) =>
      Math.abs(center.x - first.x) <= 1e-9 &&
      Math.abs(center.y - first.y) <= 1e-9 &&
      Math.abs(center.z - first.z) <= 1e-9
    )).toBe(true)
  })

  test("projects every orbital and proxy through one exact disjoint form", () => {
    const {manifest, projection} = fullFixture()
    const visual = buildBulkVisualRenderManifest(
      manifest,
      projection,
    )
    const projectedById = new Map(
      visual.manifest.orbitalParticles.map((particle) =>
        [particle.orbitalParticleId, particle] as const
      ),
    )
    const torusIds = new Set(
      visual.orbitalTori.map((torus) => torus.orbitalParticleId),
    )
    const sphereById = new Map(
      visual.orbitalSpheres.map((sphere) =>
        [sphere.orbitalParticleId, sphere] as const
      ),
    )

    for (const source of manifest.orbitalParticles ?? []) {
      const projected = projectedById.get(source.orbitalParticleId)!
      expect(projected).toBeDefined()
      expect([
        projected.localX,
        projected.localY,
        projected.localZ,
      ].every(Number.isFinite)).toBe(true)
      expect(projected).not.toHaveProperty("sphereRadius")
      expect(
        Number(torusIds.has(source.orbitalParticleId)) +
        Number(sphereById.has(source.orbitalParticleId)),
      ).toBe(1)
      const toroidal =
        source.orbitalParticleKind === "state" ||
        source.orbitalParticleKind === "process" ||
        source.orbitalParticleKind === "finally"
      if (toroidal) {
        expect(torusIds.has(source.orbitalParticleId)).toBe(true)
      } else {
        expect(torusIds.has(source.orbitalParticleId)).toBe(false)
        expect(sphereById.get(source.orbitalParticleId)?.radius)
          .toBeGreaterThan(0)
        expect(projectedById.has(source.anchorStateOrbitalParticleId!))
          .toBe(true)
      }
    }
    const proxySphereIds = new Set(visual.fieldProxySpheres.map((sphere) =>
      sphere.fieldProxyId
    ))
    const proxyTorusIds = new Set(visual.fieldProxyTori.map((torus) =>
      torus.fieldProxyId
    ))
    for (const proxy of visual.manifest.fieldProxies) {
      expect(proxy).not.toHaveProperty("ringRadius")
      expect(
        Number(proxySphereIds.has(proxy.fieldProxyId)) +
        Number(proxyTorusIds.has(proxy.fieldProxyId)),
      ).toBe(1)
    }
  })

  test("keeps deferred Axion semantics outside every render form", () => {
    const {manifest, projection} = fullFixture()
    const baseline = buildBulkVisualRenderManifest(
      manifest,
      projection,
    )
    const withAxion = structuredClone(manifest)
    const root = withAxion.darkParticles.find((particle) =>
      particle.parentDarkParticleId === null
    )!
    const child = withAxion.darkParticles.find((particle) =>
      particle.parentDarkParticleId === root.darkParticleId
    )!
    const state = withAxion.orbitalParticles?.find((particle) =>
      particle.orbitalParticleKind === "state"
    )!
    const axionDarkId = 900_000
    const hiddenChildId = 900_001
    withAxion.darkParticles.push(
      {
        ...child,
        darkParticleId: axionDarkId,
        parentDarkParticleId: root.darkParticleId,
        darkParticleKind: "axion",
        darkParticleOrder: 90_000,
        label: "Deferred Axion",
      },
      {
        ...child,
        darkParticleId: hiddenChildId,
        parentDarkParticleId: axionDarkId,
        darkParticleKind: "fuzzy",
        darkParticleOrder: 90_001,
        label: "Hidden Axion child",
      },
    )
    const axionOrbitalId = "0/deferred-axion"
    withAxion.orbitalParticles?.push({
      ...state,
      orbitalParticleId: axionOrbitalId,
      orbitalParticleKind: "axion",
      anchorStateOrbitalParticleId: state.orbitalParticleId,
      current: false,
      label: "Deferred Axion",
    })
    const proxy = withAxion.fieldProxies?.find((candidate) =>
      candidate.stateOrbitalParticleId === state.orbitalParticleId
    )!
    withAxion.relationChannels?.push({
      relationChannelId: "deferred-axion/read",
      parentDarkParticleId: state.parentDarkParticleId,
      relationKind: "axion-read",
      fromKind: "field-proxy",
      fromId: proxy.fieldProxyId,
      toKind: "orbital",
      toId: axionOrbitalId,
      active: false,
    })
    const projected = buildBulkVisualRenderManifest(
      withAxion,
      projection,
    )

    expect(projected.manifest).toEqual(baseline.manifest)
    expect(projected.orbitalSpheres).toEqual(baseline.orbitalSpheres)
    expect(projected.orbitalTori).toEqual(baseline.orbitalTori)
    expect(projected.manifest.darkParticles.some((particle) =>
      particle.darkParticleId === axionDarkId ||
      particle.darkParticleId === hiddenChildId ||
      particle.darkParticleKind === "axion"
    )).toBe(false)
    expect(projected.manifest.orbitalParticles.some((particle) =>
      particle.orbitalParticleId === axionOrbitalId ||
      particle.orbitalParticleKind === "axion"
    )).toBe(false)
    expect(projected.manifest.relationChannels.some((channel) =>
      channel.relationKind === "axion-read"
    )).toBe(false)
    expect(projected.sourceStats.darkParticleCount)
      .toBe(baseline.sourceStats.darkParticleCount + 2)
    expect(projected.sourceStats.orbitalParticleCount)
      .toBe(baseline.sourceStats.orbitalParticleCount + 1)
  })

  test("rejects Axion and orphan geometry at the renderer boundary", () => {
    const {manifest, projection} = fullFixture()
    const valid = buildBulkVisualRenderManifest(manifest, projection)
    const axion = structuredClone(valid)
    const causal = axion.manifest.orbitalParticles.find((particle) =>
      particle.orbitalParticleKind !== "state"
    )!
    causal.orbitalParticleKind = "axion"
    expect(() => assertBulkVisualProjectionBoundary(axion))
      .toThrow("deferred Axion geometry")

    const orphan = structuredClone(valid)
    orphan.manifest.darkParticles[1]!.parentDarkParticleId = 999_999
    expect(() => assertBulkVisualProjectionBoundary(orphan))
      .toThrow("has no render parent 999999")
  })

  test("rejects invalid numeric geometry before renderer state changes", () => {
    const {manifest, projection} = fullFixture()
    const valid = buildBulkVisualRenderManifest(manifest, projection)
    const cases: readonly [
      string,
      (candidate: BulkVisualRenderManifest) => void,
    ][] = [
      ["non-finite Dark Torus", (candidate) => {
        candidate.manifest.darkParticles[0]!.torusRadius = Number.NaN
      }],
      ["zero Field Sphere", (candidate) => {
        candidate.manifest.fieldParticles[0]!.sphereRadius = 0
      }],
      ["negative orbital Torus", (candidate) => {
        Object.assign(candidate.orbitalTori[0]!, {radius: -1})
      }],
      ["non-finite proxy Sphere", (candidate) => {
        Object.assign(candidate.fieldProxySpheres[0]!, {radius: Number.NaN})
      }],
      ["invalid Dark Torus mesh detail", (candidate) => {
        Object.assign(candidate.darkTorusMeshDetail, {radialSegments: 0})
      }],
      ["invalid embedded Torus mesh detail", (candidate) => {
        Object.assign(candidate.embeddedTorusMeshDetail, {
          radialSegments: 0,
        })
      }],
      ["invalid Sphere mesh detail", (candidate) => {
        Object.assign(candidate.sphereMeshDetail, {heightSegments: 0})
      }],
      ["non-finite orbital position", (candidate) => {
        candidate.manifest.orbitalParticles[0]!.localX =
          Number.POSITIVE_INFINITY
      }],
      ["non-finite proxy position", (candidate) => {
        candidate.manifest.fieldProxies[0]!.localZ = Number.NaN
      }],
      ["out-of-range render color", (candidate) => {
        candidate.manifest.fieldParticles[0]!.colorR = 2
      }],
      ["invalid source count", (candidate) => {
        Object.assign(candidate.sourceStats, {darkParticleCount: -1})
      }],
      ["invalid line batch fingerprint", (candidate) => {
        Object.assign(candidate.transitionPaths[0]!, {
          batchFingerprint: "not-a-fingerprint",
        })
      }],
      ["Dark material using a Sphere form", (candidate) => {
        Object.assign(candidate.darkMaterials[0]!.material, {
          form: "sphere",
          highlightSize: 1,
        })
      }],
      ["Field material with Torus highlight law", (candidate) => {
        Object.assign(candidate.fieldMaterials[0]!.material, {
          highlightSize: 0,
        })
      }],
      ["split forward Transition batches for one owner", (candidate) => {
        const first = candidate.transitionPaths.find((path) =>
          !path.returning
        )!
        const second = candidate.transitionPaths.find((path) =>
          !path.returning &&
            path.ownerDarkParticleId === first.ownerDarkParticleId &&
          path.batchId === first.batchId &&
          path.transitionChannelId !== first.transitionChannelId
        )!
        Object.assign(second, {
          batchId: `${second.batchId}:split`,
          batchFingerprint: "0123456789abcdef",
        })
      }],
    ]

    for (const [label, corrupt] of cases) {
      const candidate = structuredClone(valid)
      corrupt(candidate)
      expect(
        () => assertBulkVisualProjectionBoundary(candidate),
        label,
      ).toThrow()
    }
  })

  test("is deterministic and produces a no-op second viewport patch", () => {
    const {manifest, projection} = fullFixture()
    const first = buildBulkVisualRenderManifest(
      manifest,
      projection,
    )
    const second = buildBulkVisualRenderManifest(
      manifest,
      projection,
    )
    expect(second).toEqual(first)

    const scene = new BulkSceneStore()
    scene.apply(first.manifest)
    expectEmptyPatch(scene.apply(second.manifest))
  })

  test("ignores an unrelated same-src Atom that is not manifested", () => {
    const {manifest, projection} = fullFixture()
    const extraProjection = structuredClone(projection)
    const root = extraProjection.atoms.find((atom) =>
      atom.wimp === manifest.rootSrc
    )!
    extraProjection.atoms.push({
      ...root,
      id: 999_999,
      position: root.position + 100,
    })

    expect(
      buildBulkVisualRenderManifest(
        manifest,
        extraProjection,
      ),
    ).toEqual(
      buildBulkVisualRenderManifest(manifest, projection),
    )
  })

  test("keeps two manifested same-src Atom in exact namespaces", () => {
    const src = "owner/repeated"
    const projection: BulkRuntimeProjection = {
      atoms: [
        {
          id: 1,
          parentAtom: null,
          parentTopology: null,
          position: 0,
          wimp: src,
        },
        {
          id: 2,
          parentAtom: 1,
          parentTopology: null,
          position: 0,
          wimp: src,
        },
      ],
      topologies: [],
      wimps: [{src, name: "Repeated"}],
      fields: [{
        id: 10,
        wimp: src,
        key: "shared",
        type: "string",
        label: "Shared",
      }],
      states: [{
        id: 20,
        wimp: src,
        name: "idle",
        position: 0,
      }],
      transitions: [],
      conditions: [],
      processes: [],
      reactions: [],
      atomStates: [
        {atom: 1, state: 20},
        {atom: 2, state: null},
      ],
      fieldEnumVariants: [],
      atomValues: [
        {atom: 1, field: 10, value: 100},
        {atom: 2, field: 10, value: 100},
      ],
      values: [{
        id: 100,
        kind: "string",
        booleanValue: null,
        numberValue: null,
        textValue: "same",
        enumValue: null,
      }],
      valueItems: [],
      matterParticles: [],
      matterTopologyBindingPaths: [],
      matterChildWimpBindingPaths: [],
    }
    const manifest = buildBulkManifestation(projection, src)

    const visual = buildBulkVisualRenderManifest(
      manifest,
      projection,
    )
    expect(visual.manifest.darkParticles.map((particle) =>
      particle.darkParticleId
    )).toEqual([2, 4])
    expect(visual.manifest.fieldParticles).toHaveLength(1)
    expect(visual.fieldAliases).toHaveLength(2)
    expect(new Set(visual.fieldAliases.map((alias) =>
      alias.sourceParentDarkParticleId
    ))).toEqual(new Set([2, 4]))
    expect(new Set(visual.manifest.orbitalParticles?.map((particle) =>
      particle.orbitalParticleId.split("/sleeve/")[0]
    ))).toEqual(new Set(["atom/1", "atom/2"]))
  })

  test("fails closed when an exact condition proxy is absent", () => {
    const {manifest, projection} = fullFixture()
    const valid = buildBulkVisualRenderManifest(
      manifest,
      projection,
    )
    const processProxyIds = new Set(
      (manifest.relationChannels ?? []).flatMap((channel) =>
        channel.relationKind === "process-read" ||
          channel.relationKind === "process-write"
          ? [
              channel.fromKind === "field-proxy"
                ? channel.fromId
                : channel.toId,
            ]
          : []
      ),
    )
    const missingProxyId = manifest.transitionChannels?.flatMap((channel) =>
      channel.conditionFieldIds.map((fieldId) =>
        manifest.fieldProxies?.find((proxy) =>
          proxy.stateOrbitalParticleId === channel.fromOrbitalParticleId &&
          proxy.fieldId === fieldId &&
          !processProxyIds.has(proxy.fieldProxyId)
        )?.fieldProxyId
      )
    ).find((proxyId): proxyId is string => proxyId !== undefined)!
    expect(valid.fieldProxySpheres.some((proxy) =>
      proxy.fieldProxyId === missingProxyId
    )).toBe(true)
    const incomplete = structuredClone(manifest)
    incomplete.fieldProxies = (incomplete.fieldProxies ?? []).filter(
      (proxy) => proxy.fieldProxyId !== missingProxyId,
    )

    expect(() => buildBulkVisualRenderManifest(
      incomplete,
      projection,
    )).toThrow("condition Field proxy")
  })

  test("fails closed on mismatched condition metadata", () => {
    const {manifest, projection} = fullFixture()
    const mismatchedTransition = structuredClone(manifest)
    const channel = mismatchedTransition.transitionChannels?.find(
      (candidate) => candidate.conditionFieldIds.length > 0,
    )!
    channel.conditionFieldIds = [999_999]
    expect(() => buildBulkVisualRenderManifest(
      mismatchedTransition,
      projection,
    )).toThrow("condition Field proxy")

    const valid = buildBulkVisualRenderManifest(
      manifest,
      projection,
    )
    const mismatchedProxy = structuredClone(manifest)
    const conditionProxyId = valid.fieldProxySpheres[0]!.fieldProxyId
    const proxy = mismatchedProxy.fieldProxies?.find((candidate) =>
      candidate.fieldProxyId === conditionProxyId
    )!
    const wrongField = manifest.fieldParticles.find((field) =>
      field.fieldId !== proxy.fieldId
    )!
    proxy.fieldParticleId = wrongField.fieldParticleId
    expect(() => buildBulkVisualRenderManifest(
      mismatchedProxy,
      projection,
    )).toThrow("has unresolved identity")
  })

  test("ships only the two fixed Store-selected laws in the production browser bundle", async () => {
    const result = await Bun.build({
      entrypoints: [new URL("./client.ts", import.meta.url).pathname],
      minify: true,
      target: "browser",
    })
    expect(result.success).toBe(true)
    const javascript = (
      await Promise.all(
        result.outputs
          .filter((output) => output.path.endsWith(".js"))
          .map((output) => output.text()),
      )
    ).join("\n")

    expect(javascript).toContain("centered-nested")
    expect(javascript).toContain("/initial")
    expect(javascript).toContain("bulk-loader")
    expect(javascript).not.toContain("bulk-initial")
    expect(javascript).not.toContain("__METAFOR_BULK_INITIAL_JSON__")
    expect(javascript).toContain("outside-in")
    expect(javascript).not.toContain("playground")
    expect(javascript).not.toContain("defineVisualLayout")
    expect(javascript).not.toContain("buildOutsideInVisualScene")
    expect(javascript).not.toContain("projectVisualSceneToViewport")
    for (const legacySymbol of [
      "bulk/gravity/layout/snapshot",
      "bulk/gravity/layout/stream",
      "bulk/gravity/level/detail",
      "bulk/gravity/level/geometry",
      "bulk/gravity/level/memo",
      "latticePoints",
      "placeOrbitItemsByBands",
      "createQuadTorusWireframeGeometry",
      "getTorusWireframeGeometry",
      "getSphereWireframeGeometry",
      "applyCanonicalManifestPatchToScene",
    ]) {
      expect(javascript).not.toContain(legacySymbol)
    }
  })
})
