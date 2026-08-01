import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkProjectionStore} from "../../bulk/projection.ts"
import {CenteredNested} from "./CenteredNested.ts"
import {OutsideIn} from "./OutsideIn.ts"
import {buildVisualScenePayload} from "./ScenePayload.ts"
import {prepareVisualScene} from "./ScenePreparation.ts"
import type {VisualUpstreamChange} from "./SceneReconciler.ts"
import {hydrateVisualStore, VisualStore} from "./VisualStore.ts"
import {visualLayoutBuiltScenes, type VisualLayout} from "./internal/layout.ts"
import {ladaLayoutInput} from "./testing/lada-fixture.ts"

const upstream = (
  change: Partial<VisualUpstreamChange>,
): VisualUpstreamChange => ({
  affectedAtomIds: [],
  changed: true,
  facet: "none",
  structural: false,
  ...change,
})

/**
 * A hydrated Store plus the input it was prepared from.
 *
 * The layout runs exactly once here, standing in for the server. Everything a
 * test does afterwards is what a browser would do, so a test that observes
 * `visualLayoutBuiltScenes()` moving has caught the browser laying out again.
 */
const hydrated = (
  layout: VisualLayout = CenteredNested,
  mutate?: (manifest: BulkManifest) => BulkManifest,
  mutateProjection?: (projection: BulkProjectionStore) => void,
): Readonly<{manifest: BulkManifest; store: VisualStore}> => {
  const input = ladaLayoutInput(mutate, mutateProjection)
  const prepared = prepareVisualScene(layout, input, {
    frontier: {acceptanceSequence: 7, cutId: "cut-a"},
    sourceRevision: "rev-1",
  })
  return {
    manifest: input.manifest,
    store: hydrateVisualStore(prepared, {
      placement: layout.placement,
      slug: layout.slug,
    }),
  }
}

/** An Atom that owns State occurrences, so a repaint has something to reach. */
const ownerAtomId = (manifest: BulkManifest): number => {
  const owner = (manifest.orbitalParticles ?? []).find((particle) =>
    particle.orbitalParticleKind === "state"
  )
  if (!owner) throw new Error("fixture has no State occurrence")
  return owner.parentDarkParticleId / 2
}

describe("Visual Store hydration", () => {
  test("hydrates from prepared state without running a layout", () => {
    const input = ladaLayoutInput()
    const prepared = prepareVisualScene(CenteredNested, input, {
      frontier: {acceptanceSequence: 3, cutId: "cut-a"},
      sourceRevision: "rev-1",
    })

    const before = visualLayoutBuiltScenes()
    const store = hydrateVisualStore(prepared, {
      placement: CenteredNested.placement,
      slug: CenteredNested.slug,
    })
    expect(visualLayoutBuiltScenes()).toBe(before)

    expect(store.layoutSlug).toBe("centered-nested")
    expect(store.frontier).toEqual({acceptanceSequence: 3, cutId: "cut-a"})
    expect(store.payload).toBe(prepared.payload)
    expect(store.describe().keys).toEqual(prepared.keys)
  })

  test("indexes every entity the payload carries", () => {
    const {manifest, store} = hydrated()
    const payload = store.payload

    for (const torus of payload.tori) {
      expect(store.torus(torus.darkParticleId)).toBe(torus)
    }
    for (const field of payload.fields) {
      expect(store.field(field.fieldParticleId)).toBe(field)
    }
    for (const orbital of payload.orbitals) {
      expect(store.orbital(orbital.orbitalParticleId)).toBe(orbital)
    }
    for (const proxy of payload.fieldProxies) {
      expect(store.fieldProxy(proxy.fieldProxyId)).toBe(proxy)
    }
    expect(store.rendererRecordCount()).toBe(
      payload.tori.length + payload.fields.length + payload.orbitals.length +
        payload.fieldProxies.length + payload.transitionBatches.length +
        payload.relationBatches.length,
    )
    expect(manifest.darkParticles.length).toBeGreaterThan(0)
  })

  test("resolves every upstream Field occurrence to the marker that draws it", () => {
    const {manifest, store} = hydrated()
    const drawn = manifest.fieldParticles.filter((field) =>
      store.visualFieldForSource(field.fieldParticleId) !== undefined
    )
    expect(drawn.length).toBeGreaterThan(0)

    for (const field of drawn) {
      const marker = store.visualFieldForSource(field.fieldParticleId)!
      const sources = store.sourcesOfVisualField(marker.fieldParticleId)
      expect(
        sources.some((alias) =>
          alias.sourceFieldParticleId === field.fieldParticleId
        ),
      ).toBe(true)
    }
  })

  test("groups State occurrences into indivisible sleeves", () => {
    const {store} = hydrated()
    const sleeves = new Map<string, number>()
    for (const orbital of store.payload.orbitals) {
      if (
        orbital.orbitalParticleKind !== "state" ||
        orbital.sleeveRootStateId === null
      ) continue
      const key = `${orbital.ownerDarkParticleId}:${orbital.sleeveRootStateId}`
      sleeves.set(key, (sleeves.get(key) ?? 0) + 1)
    }
    expect(sleeves.size).toBeGreaterThan(0)
    for (const [key, count] of sleeves) {
      const [owner, root] = key.split(":")
      expect(store.sleeve(Number(owner), Number(root)).length).toBe(count)
    }
  })

  test("refuses state prepared for another strategy", () => {
    const prepared = prepareVisualScene(OutsideIn, ladaLayoutInput(), {
      frontier: null,
      sourceRevision: "rev-1",
    })
    expect(() =>
      hydrateVisualStore(prepared, {
        placement: CenteredNested.placement,
        slug: CenteredNested.slug,
      })
    ).toThrow(/centered-nested state prepared as outside-in/)
  })

  test("refuses anything that is not server-prepared state", () => {
    expect(() =>
      hydrateVisualStore({kind: "nope"} as never, {
        placement: CenteredNested.placement,
      })
    ).toThrow(/server-prepared visual state/)
  })
})

describe("Visual Store affected closure", () => {
  test("keeps the Atom identities upstream named", () => {
    const {manifest, store} = hydrated()
    const atomId = ownerAtomId(manifest)
    const closure = store.closureOf(upstream({affectedAtomIds: [atomId]}))

    expect(closure.whole).toBe(false)
    expect(closure.atomIds).toEqual([atomId])
    expect(closure.ownerDarkParticleIds).toContain(atomId * 2)
  })

  test("a named change reaches a small fraction of the scene", () => {
    const {manifest, store} = hydrated()
    const closure = store.closureOf(
      upstream({affectedAtomIds: [ownerAtomId(manifest)]}),
    )
    const reached = closure.orbitalParticleIds.length +
      closure.fieldProxyIds.length + closure.fieldParticleIds.length
    const total = store.payload.orbitals.length +
      store.payload.fieldProxies.length + store.payload.fields.length

    expect(reached).toBeGreaterThan(0)
    expect(reached).toBeLessThan(total / 2)
  })

  test("a change that named no Atom is honestly scene-wide", () => {
    const {store} = hydrated()
    const closure = store.closureOf(upstream({affectedAtomIds: []}))

    expect(closure.whole).toBe(true)
    expect(closure.orbitalParticleIds.length).toBe(store.payload.orbitals.length)
    expect(closure.ownerDarkParticleIds.length).toBe(store.payload.tori.length)
  })

  test("an unknown Atom cannot be proven local", () => {
    const {store} = hydrated()
    expect(store.closureOf(upstream({affectedAtomIds: [999_999]})).whole)
      .toBe(true)
  })

  test("a merged marker travels with the change that reached it", () => {
    const {manifest, store} = hydrated()
    const shared = store.payload.fields.find((field) =>
      store.sourcesOfVisualField(field.fieldParticleId).length > 1
    )
    if (!shared) return

    const owners = new Set(
      store.sourcesOfVisualField(shared.fieldParticleId)
        .map((alias) => alias.sourceParentDarkParticleId),
    )
    expect(owners.size).toBeGreaterThan(1)

    const [first] = [...owners]
    const closure = store.closureOf(
      upstream({affectedAtomIds: [first! / 2]}),
    )
    // The marker itself hangs at the ancestor that owns it, so that owner has
    // to be reachable. The other owners that merely share the marker did not
    // change, and their own Tori and sleeves stay out of the closure.
    expect(closure.fieldParticleIds).toContain(shared.fieldParticleId)
    expect(closure.ownerDarkParticleIds).toContain(shared.ownerDarkParticleId)
    expect(closure.ownerDarkParticleIds).toContain(first!)
    expect(manifest.fieldParticles.length).toBeGreaterThan(0)
  })

  test("closure under outside-in stops at the owners upstream named", () => {
    const {manifest, store} = hydrated(OutsideIn)
    const atomId = ownerAtomId(manifest)
    const closure = store.closureOf(upstream({affectedAtomIds: [atomId]}))

    // Markers are one per owner here, so no alias can widen the reach.
    expect(closure.ownerDarkParticleIds).toEqual([atomId * 2])
  })
})

describe("Visual Store scope gating", () => {
  test("a geometry change is refused rather than guessed at", () => {
    const {manifest, store} = hydrated()
    const applied = store.apply(
      upstream({affectedAtomIds: [ownerAtomId(manifest)], facet: "field-value"}),
      manifest,
    )

    expect(applied.kind).toBe("visual-store-rebuild-required")
    expect(applied.scope).toBe("geometry")
    if (applied.kind !== "visual-store-rebuild-required") throw new Error("scope")
    expect(applied.reason).toContain("centered-nested")
  })

  test("the same Field Value change is appearance-only where placement ignores it", () => {
    const {manifest, store} = hydrated(OutsideIn)
    const applied = store.apply(
      upstream({affectedAtomIds: [ownerAtomId(manifest)], facet: "field-value"}),
      manifest,
    )

    expect(applied.scope).toBe("appearance")
    expect(applied.kind).toBe("visual-store-applied")
  })

  test("a structural change is refused under either strategy", () => {
    for (const layout of [CenteredNested, OutsideIn]) {
      const {manifest, store} = hydrated(layout)
      const applied = store.apply(
        upstream({affectedAtomIds: [ownerAtomId(manifest)], structural: true}),
        manifest,
      )
      expect(applied.kind).toBe("visual-store-rebuild-required")
      expect(applied.scope).toBe("structure")
    }
  })

  test("story control and camera move no scene entity", () => {
    const {manifest, store} = hydrated()
    const payload = store.payload

    for (const facet of ["story-control", "camera"] as const) {
      const applied = store.apply(upstream({facet}), manifest)
      expect(applied.kind).toBe("visual-store-applied")
      expect(applied.scope).toBe(facet === "camera" ? "camera" : "story-control")
      if (applied.kind !== "visual-store-applied") throw new Error("scope")
      expect(applied.patch.kind).toBe("visual-none-patch")
    }
    expect(store.payload).toBe(payload)
  })

  test("an unchanged upstream part costs nothing", () => {
    const {manifest, store} = hydrated()
    const payload = store.payload
    const applied = store.apply(upstream({changed: false}), manifest)

    expect(applied.scope).toBe("none")
    if (applied.kind !== "visual-store-applied") throw new Error("scope")
    expect(applied.patch.kind).toBe("visual-none-patch")
    expect(store.payload).toBe(payload)
  })
})

describe("Visual Store local repaint", () => {
  /**
   * The scenario production cares about most: an Atom entered a different
   * State. Under both strategies that moves no geometry, but it moves the paint
   * of every State torus, condition proxy and causal placement in the sleeve.
   */
  const movedState = (
    layout: VisualLayout = CenteredNested,
  ): Readonly<{
    atomId: number
    manifest: BulkManifest
    store: VisualStore
  }> => {
    const {manifest: before, store} = hydrated(layout)
    const atomId = ownerAtomId(before)

    // The next State is chosen from the projection so the manifest and the
    // owner graph agree on the identity, which is what a strategy requires.
    const {manifest} = hydrated(layout, undefined, (projection) => {
      const current = projection.atomStates.get(atomId)
      const alternatives = [...projection.states.values()].filter((state) =>
        state.id !== current?.state
      )
      const next = alternatives[0]
      if (next) projection.atomStates.set(atomId, {atom: atomId, state: next.id})
    })
    return {atomId, manifest, store}
  }

  test("a current-State change repaints without running a layout", () => {
    const {atomId, manifest, store} = movedState()
    const before = visualLayoutBuiltScenes()

    const applied = store.apply(
      upstream({affectedAtomIds: [atomId], facet: "current-state"}),
      manifest,
    )

    expect(visualLayoutBuiltScenes()).toBe(before)
    expect(applied.scope).toBe("appearance")
    if (applied.kind !== "visual-store-applied") throw new Error("refused")
    if (applied.patch.kind !== "visual-delta-patch") throw new Error("no patch")

    const touched = applied.patch.orbitals.updated.length +
      applied.patch.fieldProxies.updated.length
    expect(touched).toBeGreaterThan(0)
  })

  test("a repaint moves nothing and adds nothing", () => {
    const {atomId, manifest, store} = movedState()
    const placements = new Map(
      store.payload.orbitals.map((orbital) =>
        [
          orbital.orbitalParticleId,
          [orbital.localX, orbital.localY, orbital.localZ] as const,
        ] as const
      ),
    )

    const applied = store.apply(
      upstream({affectedAtomIds: [atomId], facet: "current-state"}),
      manifest,
    )
    if (applied.kind !== "visual-store-applied") throw new Error("refused")
    if (applied.patch.kind !== "visual-delta-patch") throw new Error("no patch")

    expect(applied.patch.orbitals.added).toEqual([])
    expect(applied.patch.orbitals.removed).toEqual([])
    expect(applied.patch.tori.added).toEqual([])
    expect(applied.patch.fields.added).toEqual([])
    for (const orbital of applied.patch.orbitals.updated) {
      expect([orbital.localX, orbital.localY, orbital.localZ])
        .toEqual([...placements.get(orbital.orbitalParticleId)!])
    }
  })

  test("the repainted payload is the payload a rebuild would have produced", () => {
    const {atomId, manifest, store} = movedState()
    const applied = store.apply(
      upstream({affectedAtomIds: [atomId], facet: "current-state"}),
      manifest,
    )
    expect(applied.kind).toBe("visual-store-applied")

    const rebuilt = buildVisualScenePayload(
      CenteredNested,
      ladaLayoutInput(undefined, (projection) => {
        const current = projection.atomStates.get(atomId)
        const alternatives = [...projection.states.values()].filter((state) =>
          state.id !== current?.state
        )
        const next = alternatives[0]
        if (next) projection.atomStates.set(atomId, {atom: atomId, state: next.id})
      }),
    )
    const oracle = store.oracleAgainst(rebuilt)
    expect(oracle.differences).toEqual([])
    expect(oracle.equal).toBe(true)
  })

  test("only the entities in the patch have a newer renderer generation", () => {
    const {atomId, manifest, store} = movedState()
    const before = new Map(
      store.payload.orbitals.map((orbital) =>
        [
          orbital.orbitalParticleId,
          store.rendererRecord("orbital", orbital.orbitalParticleId)!.generation,
        ] as const
      ),
    )

    const applied = store.apply(
      upstream({affectedAtomIds: [atomId], facet: "current-state"}),
      manifest,
    )
    if (applied.kind !== "visual-store-applied") throw new Error("refused")
    if (applied.patch.kind !== "visual-delta-patch") throw new Error("no patch")

    const repainted = new Set(
      applied.patch.orbitals.updated.map((o) => o.orbitalParticleId),
    )
    for (const [id, generation] of before) {
      const now = store.rendererRecord("orbital", id)!.generation
      expect(now).toBe(repainted.has(id) ? generation + 1 : generation)
    }
  })

  test("a repaint that changes nothing produces an empty patch", () => {
    const {manifest, store} = hydrated()
    const applied = store.apply(
      upstream({affectedAtomIds: [ownerAtomId(manifest)], facet: "appearance"}),
      manifest,
    )
    if (applied.kind !== "visual-store-applied") throw new Error("refused")
    if (applied.patch.kind !== "visual-delta-patch") throw new Error("no patch")

    expect(applied.patch.orbitals.updated).toEqual([])
    expect(applied.patch.fieldProxies.updated).toEqual([])
    expect(applied.patch.tori.updated).toEqual([])
    expect(applied.patch.transitionBatches.updated).toEqual([])
    expect(applied.patch.relationBatches.updated).toEqual([])
  })
})

describe("Visual Store causal continuation", () => {
  test("advances the frontier a change carries", () => {
    const {manifest, store} = hydrated()
    store.apply(upstream({facet: "camera"}), manifest, {
      frontier: {acceptanceSequence: 9, cutId: "cut-a"},
      sourceRevision: "rev-2",
    })

    expect(store.frontier).toEqual({acceptanceSequence: 9, cutId: "cut-a"})
    expect(store.describe().keys.sourceRevision).toBe("rev-2")
  })

  test("re-delivery after a reconnect is idempotent", () => {
    const {atomId, manifest, store} = (() => {
      const base = hydrated()
      return {atomId: ownerAtomId(base.manifest), ...base}
    })()
    const payload = store.payload

    for (const acceptanceSequence of [7, 6, 1]) {
      const applied = store.apply(
        upstream({affectedAtomIds: [atomId], facet: "current-state"}),
        manifest,
        {frontier: {acceptanceSequence, cutId: "cut-a"}},
      )
      if (applied.kind !== "visual-store-applied") throw new Error("refused")
      expect(applied.duplicate).toBe(true)
      expect(applied.patch.kind).toBe("visual-none-patch")
    }
    expect(store.payload).toBe(payload)
    expect(store.frontier).toEqual({acceptanceSequence: 7, cutId: "cut-a"})
  })

  test("a change from another cut is not mistaken for a duplicate", () => {
    const {manifest, store} = hydrated()
    const applied = store.apply(upstream({facet: "camera"}), manifest, {
      frontier: {acceptanceSequence: 1, cutId: "cut-b"},
    })

    if (applied.kind !== "visual-store-applied") throw new Error("refused")
    expect(applied.duplicate).toBe(false)
    expect(store.frontier).toEqual({acceptanceSequence: 1, cutId: "cut-b"})
  })
})

describe("Visual Store adoption", () => {
  test("reduces a rebuilt payload to exact operations", () => {
    const {store} = hydrated()
    const rebuilt = buildVisualScenePayload(
      CenteredNested,
      ladaLayoutInput((manifest) => ({
        ...manifest,
        darkParticles: manifest.darkParticles.map((particle) =>
          particle.parentDarkParticleId === null
            ? particle
            : {...particle, label: `${particle.label}!`}
        ),
      })),
    )

    const patch = store.adopt(rebuilt, {
      frontier: {acceptanceSequence: 11, cutId: "cut-a"},
    })
    expect(patch.kind).toBe("visual-delta-patch")
    expect(patch.tori.updated.length).toBeGreaterThan(0)
    expect(store.payload).toBe(rebuilt)
    expect(store.frontier).toEqual({acceptanceSequence: 11, cutId: "cut-a"})
    expect(store.oracleAgainst(rebuilt).equal).toBe(true)
  })

  test("refuses a payload from another strategy", () => {
    const {store} = hydrated()
    expect(() =>
      store.adopt(buildVisualScenePayload(OutsideIn, ladaLayoutInput()))
    ).toThrow(/holds centered-nested and cannot adopt outside-in/)
  })

  test("the oracle names what actually differs", () => {
    const {store} = hydrated()
    const oracle = store.oracleAgainst(
      buildVisualScenePayload(
        CenteredNested,
        ladaLayoutInput((manifest) => ({
          ...manifest,
          darkParticles: manifest.darkParticles.map((particle) =>
            particle.parentDarkParticleId === null
              ? particle
              : {...particle, label: `${particle.label}?`}
          ),
        })),
      ),
    )
    expect(oracle.equal).toBe(false)
    expect(oracle.differences.some((line) => line.startsWith("torus differs")))
      .toBe(true)
  })
})
