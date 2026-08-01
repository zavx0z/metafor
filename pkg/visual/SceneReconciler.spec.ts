import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {CenteredNested} from "./CenteredNested.ts"
import {OutsideIn} from "./OutsideIn.ts"
import {
  buildVisualScenePayload,
  type VisualScenePayload,
} from "./ScenePayload.ts"
import {
  classifyVisualInvalidation,
  reconcileVisualScenePayload,
  sameVisualPayloadIdentities,
  summarizeVisualScenePatch,
  widenVisualInvalidation,
} from "./SceneReconciler.ts"
import type {VisualLayout} from "./internal/layout.ts"
import {ladaLayoutInput} from "./testing/lada-fixture.ts"

const payloadOf = (
  layout: VisualLayout,
  mutate?: (manifest: BulkManifest) => BulkManifest,
): VisualScenePayload =>
  buildVisualScenePayload(layout, ladaLayoutInput(mutate))

/**
 * One genuine structural removal: the deepest leaf Atom together with every
 * entity that belongs to it. Keeping the manifest coherent is what makes this a
 * real topology change rather than a dangling reference.
 */
const withoutLeafAtom = (manifest: BulkManifest): BulkManifest => {
  const parentIds = new Set(
    manifest.darkParticles
      .map((particle) => particle.parentDarkParticleId)
      .filter((id): id is number => id !== null),
  )
  const leaf = manifest.darkParticles
    .filter((particle) =>
      particle.darkParticleKind === "atom" &&
      particle.parentDarkParticleId !== null &&
      !parentIds.has(particle.darkParticleId)
    )
    .toSorted((left, right) => right.depth - left.depth)[0]
  if (!leaf) throw new Error("fixture has no removable leaf Atom")

  const removed = leaf.darkParticleId
  const keptOrbitalIds = new Set(
    (manifest.orbitalParticles ?? [])
      .filter((particle) => particle.parentDarkParticleId !== removed)
      .map((particle) => particle.orbitalParticleId),
  )
  const keptProxies = (manifest.fieldProxies ?? []).filter((proxy) =>
    proxy.parentDarkParticleId !== removed
  )
  const keptProxyIds = new Set(keptProxies.map((proxy) => proxy.fieldProxyId))
  const keptFieldIds = new Set(
    manifest.fieldParticles
      .filter((field) => field.parentDarkParticleId !== removed)
      .map((field) => field.fieldParticleId),
  )
  const endpointKept = (
    kind: "field" | "field-proxy" | "orbital",
    id: string,
  ): boolean =>
    kind === "field"
      ? keptFieldIds.has(id)
      : kind === "field-proxy"
        ? keptProxyIds.has(id)
        : keptOrbitalIds.has(id)

  return {
    rootSrc: manifest.rootSrc,
    darkParticles: manifest.darkParticles.filter((particle) =>
      particle.darkParticleId !== removed
    ),
    fieldParticles: manifest.fieldParticles.filter((field) =>
      field.parentDarkParticleId !== removed
    ),
    orbitalParticles: (manifest.orbitalParticles ?? []).filter((particle) =>
      particle.parentDarkParticleId !== removed
    ),
    transitionChannels: (manifest.transitionChannels ?? []).filter((channel) =>
      channel.parentDarkParticleId !== removed
    ),
    fieldProxies: keptProxies,
    relationChannels: (manifest.relationChannels ?? []).filter((channel) =>
      channel.parentDarkParticleId !== removed &&
      endpointKept(channel.fromKind, channel.fromId) &&
      endpointKept(channel.toKind, channel.toId)
    ),
  }
}

describe("Visual invalidation scope", () => {
  test("classifies an unchanged upstream particle as no work", () => {
    expect(classifyVisualInvalidation({changed: false, structural: false}))
      .toBe("none")
    expect(classifyVisualInvalidation({changed: false, structural: true}))
      .toBe("none")
  })

  test("classifies a Value or current-State change as appearance-only", () => {
    expect(classifyVisualInvalidation({changed: true, structural: false}))
      .toBe("appearance")
  })

  test("escalates any structural change to a full rebuild", () => {
    expect(classifyVisualInvalidation({changed: true, structural: true}))
      .toBe("structure")
  })

  test("widens to the stricter of two scopes", () => {
    expect(widenVisualInvalidation("none", "appearance")).toBe("appearance")
    expect(widenVisualInvalidation("appearance", "none")).toBe("appearance")
    expect(widenVisualInvalidation("appearance", "structure")).toBe("structure")
    expect(widenVisualInvalidation("structure", "appearance")).toBe("structure")
    expect(widenVisualInvalidation("none", "none")).toBe("none")
  })
})

describe("Visual scene reconciliation", () => {
  test("replaces the scene when there is nothing rendered yet", () => {
    const payload = payloadOf(CenteredNested)
    const patch = reconcileVisualScenePayload(null, payload)

    expect(patch.kind).toBe("visual-replace-patch")
    if (patch.kind !== "visual-replace-patch") throw new Error("unreachable")
    expect(patch.payload).toBe(payload)
  })

  test("asks for no work when nothing changed", () => {
    const patch = reconcileVisualScenePayload(
      payloadOf(CenteredNested),
      payloadOf(CenteredNested),
    )

    expect(patch.kind).toBe("visual-none-patch")
    expect(summarizeVisualScenePatch(patch).total).toBe(0)
  })

  test("keeps a localized Value change off the geometry path", () => {
    const before = payloadOf(CenteredNested)
    const after = payloadOf(CenteredNested, (manifest) => ({
      ...manifest,
      fieldParticles: manifest.fieldParticles.map((field, index) =>
        index === 0 ? {...field, valueText: "changed-by-test"} : field
      ),
    }))
    const patch = reconcileVisualScenePayload(before, after)
    const summary = summarizeVisualScenePatch(patch)

    expect(patch.kind).toBe("visual-appearance-patch")
    expect(summary.fields).toBe(1)
    expect(summary.tori).toBe(0)
    expect(summary.orbitals).toBe(0)
    expect(summary.transitionBatches).toBe(0)
    expect(summary.relationBatches).toBe(0)
    expect(summary.total).toBeLessThan(
      summarizeVisualScenePatch(
        reconcileVisualScenePayload(null, after),
      ).total,
    )
  })

  test("updates only the branch whose activity moved", () => {
    const before = payloadOf(CenteredNested)

    // The real current-State path: one `photon` moves an Atom's State. The
    // manifest and its owner graph both derive from the projection, so they
    // stay in agreement.
    const after = buildVisualScenePayload(
      CenteredNested,
      ladaLayoutInput(undefined, (projection) => {
        const atomState = [...projection.atomStates.values()].find(
          (entry) => entry.state !== null,
        )
        if (!atomState) throw new Error("fixture has no current State")
        const atom = projection.atoms.get(atomState.atom)
        if (!atom) throw new Error("fixture has no owning Atom")
        const sibling = [...projection.states.values()].find((state) =>
          state.wimp === atom.wimp && state.id !== atomState.state
        )
        if (!sibling) throw new Error("fixture has no sibling State")
        atomState.state = sibling.id
      }),
    )
    const patch = reconcileVisualScenePayload(before, after)
    const summary = summarizeVisualScenePatch(patch)

    expect(patch.kind).toBe("visual-appearance-patch")
    expect(summary.orbitals).toBeGreaterThan(0)
    expect(summary.orbitals).toBeLessThan(before.orbitals.length)
    expect(summary.total).toBeLessThan(
      summarizeVisualScenePatch(
        reconcileVisualScenePayload(null, after),
      ).total,
    )
    expect(
      before.orbitals.filter((orbital) => orbital.current).length,
    ).toBeGreaterThan(0)
  })

  test("replaces the scene when an entity is added", () => {
    const whole = payloadOf(CenteredNested)
    const withoutLeaf = payloadOf(CenteredNested, withoutLeafAtom)
    const patch = reconcileVisualScenePayload(withoutLeaf, whole)

    expect(whole.tori.length).toBeGreaterThan(withoutLeaf.tori.length)
    expect(patch.kind).toBe("visual-replace-patch")
    expect(sameVisualPayloadIdentities(withoutLeaf, whole)).toBe(false)
  })

  test("replaces the scene when an entity is removed", () => {
    const whole = payloadOf(CenteredNested)
    const withoutLeaf = payloadOf(CenteredNested, withoutLeafAtom)
    const patch = reconcileVisualScenePayload(whole, withoutLeaf)

    expect(patch.kind).toBe("visual-replace-patch")
    expect(sameVisualPayloadIdentities(whole, withoutLeaf)).toBe(false)
  })

  test("replaces the scene when the layout strategy changes", () => {
    const centered = payloadOf(CenteredNested)
    const outside = payloadOf(OutsideIn)

    expect(sameVisualPayloadIdentities(centered, outside)).toBe(false)
    expect(reconcileVisualScenePayload(centered, outside).kind)
      .toBe("visual-replace-patch")
  })

  test("never leaves moved geometry stale, even under the narrow patch", () => {
    const before = payloadOf(CenteredNested)
    const after = payloadOf(OutsideIn)
    const movedById = new Map(
      after.tori.map((torus) => [torus.darkParticleId, torus] as const),
    )
    const genuinelyMoved = before.tori.filter((torus) => {
      const other = movedById.get(torus.darkParticleId)
      return other !== undefined && (
        other.localX !== torus.localX ||
        other.localY !== torus.localY ||
        other.radius !== torus.radius
      )
    })
    expect(genuinelyMoved.length).toBeGreaterThan(0)

    // Same identities but different geometry must still reach the renderer.
    const relabelled: VisualScenePayload = {
      ...after,
      layoutSlug: before.layoutSlug,
      fields: before.fields,
      orbitals: before.orbitals,
      fieldProxies: before.fieldProxies,
      transitionBatches: before.transitionBatches,
      relationBatches: before.relationBatches,
    }
    const patch = reconcileVisualScenePayload(before, relabelled)

    expect(patch.kind).toBe("visual-appearance-patch")
    if (patch.kind !== "visual-appearance-patch") throw new Error("unreachable")
    const emitted = new Set(
      patch.tori.map((torus) => torus.darkParticleId),
    )
    for (const torus of genuinelyMoved) {
      expect(emitted.has(torus.darkParticleId)).toBe(true)
    }
  })

  test("keeps untouched line batches out of the patch by fingerprint", () => {
    const before = payloadOf(CenteredNested)
    const after = payloadOf(CenteredNested, (manifest) => ({
      ...manifest,
      fieldParticles: manifest.fieldParticles.map((field, index) =>
        index === 0 ? {...field, valueText: "fingerprint-probe"} : field
      ),
    }))
    const patch = reconcileVisualScenePayload(before, after)

    expect(before.transitionBatches.length).toBeGreaterThan(0)
    expect(summarizeVisualScenePatch(patch).transitionBatches).toBe(0)
    expect(after.transitionBatches.map((batch) => batch.fingerprint))
      .toEqual(before.transitionBatches.map((batch) => batch.fingerprint))
  })

  test("emits a line batch whose sampled geometry actually moved", () => {
    const before = payloadOf(CenteredNested)
    const [first, ...rest] = before.transitionBatches
    if (!first) throw new Error("fixture has no Transition batch")
    const shifted: VisualScenePayload = {
      ...before,
      transitionBatches: [
        {...first, fingerprint: `${first.fingerprint}-moved`},
        ...rest,
      ],
    }
    const patch = reconcileVisualScenePayload(before, shifted)

    expect(summarizeVisualScenePatch(patch).transitionBatches).toBe(1)
    if (patch.kind !== "visual-appearance-patch") throw new Error("unreachable")
    expect(patch.transitionBatches[0]?.batchId).toBe(first.batchId)
  })

  test("summarizes a full replacement as the whole scene", () => {
    const payload = payloadOf(CenteredNested)
    const summary = summarizeVisualScenePatch(
      reconcileVisualScenePayload(null, payload),
    )

    expect(summary.kind).toBe("visual-replace-patch")
    expect(summary.tori).toBe(payload.tori.length)
    expect(summary.fields).toBe(payload.fields.length)
    expect(summary.total).toBe(
      payload.tori.length +
        payload.fields.length +
        payload.orbitals.length +
        payload.fieldProxies.length +
        payload.transitionBatches.length +
        payload.relationBatches.length,
    )
  })

  test("reconciles the outside-in strategy through the same contract", () => {
    const before = payloadOf(OutsideIn)
    const after = payloadOf(OutsideIn, (manifest) => ({
      ...manifest,
      fieldParticles: manifest.fieldParticles.map((field, index) =>
        index === 0 ? {...field, valueText: "outside-in-probe"} : field
      ),
    }))
    const patch = reconcileVisualScenePayload(before, after)

    expect(reconcileVisualScenePayload(before, before).kind)
      .toBe("visual-none-patch")
    expect(patch.kind).toBe("visual-appearance-patch")
    expect(summarizeVisualScenePatch(patch).fields).toBe(1)
  })
})
