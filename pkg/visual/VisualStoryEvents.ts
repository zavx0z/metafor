import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {VisualStoryConditions, VisualStoryEvent} from "./VisualStory.ts"

/**
 * Standard visual events.
 *
 * These are the reusable building blocks a story is written from. Each one
 * declares the upstream fact it moved — its facet — and whether that fact is
 * structural, exactly as an upstream projection would report it. The event does
 * not decide what the change costs: the selected strategy does, because the same
 * Field Value edit is placement input under one layout and paint under another.
 * They keep the manifest coherent: an event that removes an entity also removes
 * everything that referenced it.
 */

const mapManifest = (
  conditions: VisualStoryConditions,
  change: (manifest: BulkManifest) => BulkManifest,
): VisualStoryConditions => ({
  manifest: change(conditions.manifest),
  owners: conditions.owners,
})

/** Waits without changing anything. Useful for animation and frame behavior. */
export const visualStoryWait = (advanceMs: number): VisualStoryEvent =>
  Object.freeze({
    advanceMs,
    apply: (conditions) => conditions,
    facet: "none",
    label: `wait ${advanceMs}ms`,
    structural: false,
  })

/**
 * Changes one displayed Field Value.
 *
 * Not appearance-only in general. `centered-nested` groups Fields by canonical
 * Value and lifts a shared group to the highest common owner, so a rebinding
 * moves geometry there; `outside-in` places Fields per owner core and only
 * repaints. The event states the fact and each strategy answers for its own law.
 */
export const visualStorySetFieldValue = (
  fieldParticleId: string,
  valueText: string | null,
): VisualStoryEvent => Object.freeze({
  apply: (conditions) => mapManifest(conditions, (manifest) => {
    if (
      !manifest.fieldParticles.some((field) =>
        field.fieldParticleId === fieldParticleId
      )
    ) {
      throw new Error(`Visual story Field ${fieldParticleId} is absent`)
    }
    return {
      ...manifest,
      fieldParticles: manifest.fieldParticles.map((field) =>
        field.fieldParticleId === fieldParticleId
          ? {...field, valueText}
          : field
      ),
    }
  }),
  facet: "field-value",
  label: `field ${fieldParticleId} = ${valueText ?? "null"}`,
  structural: false,
})

/**
 * Moves one owner's current State marker.
 *
 * The manifest and the owner graph both carry that identity and a strategy
 * requires them to agree, so the event moves both. Exactly one State per owner
 * stays current, which is why the marker moves instead of being duplicated.
 */
export const visualStoryMoveCurrentState = (
  ownerDarkParticleId: number,
  toOrbitalParticleId: string,
): VisualStoryEvent => Object.freeze({
  apply: (conditions) => {
    const manifest = conditions.manifest
    const orbitals = manifest.orbitalParticles ?? []
    const target = orbitals.find((particle) =>
      particle.orbitalParticleId === toOrbitalParticleId
    )
    if (
      !target ||
      target.parentDarkParticleId !== ownerDarkParticleId ||
      target.orbitalParticleKind !== "state"
    ) {
      throw new Error(
        `Visual story State ${toOrbitalParticleId} is absent from owner ${ownerDarkParticleId}`,
      )
    }
    const currentStateId = target.sourceId
    return {
      manifest: {
        ...manifest,
        orbitalParticles: orbitals.map((particle) => {
          if (
            particle.parentDarkParticleId !== ownerDarkParticleId ||
            particle.orbitalParticleKind !== "state"
          ) return particle
          return {
            ...particle,
            current: particle.sourceId === currentStateId,
          }
        }),
      },
      owners: conditions.owners.map((owner) =>
        owner.ownerDarkParticleId === ownerDarkParticleId
          ? {
            ...owner,
            graph: {
              ...owner.graph,
              currentStateId,
              states: owner.graph.states.map((state) => ({
                ...state,
                current: state.id === currentStateId,
              })),
            },
          }
          : owner
      ),
    }
  },
  facet: "current-state",
  label: `current state -> ${toOrbitalParticleId}`,
  structural: false,
})

/** Marks one causal occurrence active or inactive. */
export const visualStorySetOrbitalActivity = (
  orbitalParticleId: string,
  active: boolean,
): VisualStoryEvent => Object.freeze({
  apply: (conditions) => mapManifest(conditions, (manifest) => {
    const orbitals = manifest.orbitalParticles ?? []
    if (
      !orbitals.some((particle) =>
        particle.orbitalParticleId === orbitalParticleId
      )
    ) {
      throw new Error(`Visual story orbital ${orbitalParticleId} is absent`)
    }
    return {
      ...manifest,
      orbitalParticles: orbitals.map((particle) =>
        particle.orbitalParticleId === orbitalParticleId
          ? {...particle, active}
          : particle
      ),
    }
  }),
  facet: "effect",
  label: `${orbitalParticleId} active=${active}`,
  structural: false,
})

/** Renames one Torus. Appearance-only: a label never moves geometry. */
export const visualStoryRelabelTorus = (
  darkParticleId: number,
  label: string,
): VisualStoryEvent => Object.freeze({
  apply: (conditions) => mapManifest(conditions, (manifest) => {
    if (
      !manifest.darkParticles.some((particle) =>
        particle.darkParticleId === darkParticleId
      )
    ) {
      throw new Error(`Visual story Torus ${darkParticleId} is absent`)
    }
    return {
      ...manifest,
      darkParticles: manifest.darkParticles.map((particle) =>
        particle.darkParticleId === darkParticleId
          ? {...particle, label}
          : particle
      ),
    }
  }),
  facet: "appearance",
  label: `relabel ${darkParticleId} -> ${label}`,
  structural: false,
})

/**
 * Removes one Atom and every entity that belonged to it, including relations
 * whose endpoint disappeared. Structural: topology changed.
 */
export const visualStoryRemoveAtom = (
  darkParticleId: number,
): VisualStoryEvent => Object.freeze({
  apply: (conditions) => {
    const manifest = conditions.manifest
    const target = manifest.darkParticles.find((particle) =>
      particle.darkParticleId === darkParticleId
    )
    if (!target) {
      throw new Error(`Visual story Atom ${darkParticleId} is absent`)
    }
    if (target.parentDarkParticleId === null) {
      throw new Error("Visual story cannot remove the root Atom")
    }

    const removed = new Set([darkParticleId])
    let growing = true
    while (growing) {
      growing = false
      for (const particle of manifest.darkParticles) {
        if (
          particle.parentDarkParticleId !== null &&
          removed.has(particle.parentDarkParticleId) &&
          !removed.has(particle.darkParticleId)
        ) {
          removed.add(particle.darkParticleId)
          growing = true
        }
      }
    }
    const kept = (ownerId: number): boolean => !removed.has(ownerId)

    const orbitalParticles = (manifest.orbitalParticles ?? []).filter(
      (particle) => kept(particle.parentDarkParticleId),
    )
    const fieldParticles = manifest.fieldParticles.filter((field) =>
      kept(field.parentDarkParticleId)
    )
    const fieldProxies = (manifest.fieldProxies ?? []).filter((proxy) =>
      kept(proxy.parentDarkParticleId)
    )
    const keptOrbitalIds = new Set(
      orbitalParticles.map((particle) => particle.orbitalParticleId),
    )
    const keptFieldIds = new Set(
      fieldParticles.map((field) => field.fieldParticleId),
    )
    const keptProxyIds = new Set(
      fieldProxies.map((proxy) => proxy.fieldProxyId),
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
      manifest: {
        rootSrc: manifest.rootSrc,
        darkParticles: manifest.darkParticles.filter((particle) =>
          kept(particle.darkParticleId)
        ),
        fieldParticles,
        orbitalParticles,
        transitionChannels: (manifest.transitionChannels ?? []).filter(
          (channel) => kept(channel.parentDarkParticleId),
        ),
        fieldProxies,
        relationChannels: (manifest.relationChannels ?? []).filter((channel) =>
          kept(channel.parentDarkParticleId) &&
          endpointKept(channel.fromKind, channel.fromId) &&
          endpointKept(channel.toKind, channel.toId)
        ),
      },
      owners: conditions.owners.filter((owner) =>
        kept(owner.ownerDarkParticleId)
      ),
    }
  },
  facet: "structure",
  label: `remove atom ${darkParticleId}`,
  structural: true,
})

/** Re-parents one Atom. Structural: ownership changed. */
export const visualStoryMoveAtom = (
  darkParticleId: number,
  toParentDarkParticleId: number,
): VisualStoryEvent => Object.freeze({
  apply: (conditions) => mapManifest(conditions, (manifest) => {
    const target = manifest.darkParticles.find((particle) =>
      particle.darkParticleId === darkParticleId
    )
    const parent = manifest.darkParticles.find((particle) =>
      particle.darkParticleId === toParentDarkParticleId
    )
    if (!target || !parent) {
      throw new Error(
        `Visual story cannot move ${darkParticleId} under ${toParentDarkParticleId}`,
      )
    }
    let ancestor: number | null = toParentDarkParticleId
    while (ancestor !== null) {
      if (ancestor === darkParticleId) {
        throw new Error("Visual story move would create a cycle")
      }
      ancestor = manifest.darkParticles.find((particle) =>
        particle.darkParticleId === ancestor
      )?.parentDarkParticleId ?? null
    }
    const depthDelta = parent.depth + 1 - target.depth
    const moved = new Set([darkParticleId])
    let growing = true
    while (growing) {
      growing = false
      for (const particle of manifest.darkParticles) {
        if (
          particle.parentDarkParticleId !== null &&
          moved.has(particle.parentDarkParticleId) &&
          !moved.has(particle.darkParticleId)
        ) {
          moved.add(particle.darkParticleId)
          growing = true
        }
      }
    }
    return {
      ...manifest,
      darkParticles: manifest.darkParticles.map((particle) => {
        if (particle.darkParticleId === darkParticleId) {
          return {
            ...particle,
            parentDarkParticleId: toParentDarkParticleId,
            depth: particle.depth + depthDelta,
          }
        }
        return moved.has(particle.darkParticleId)
          ? {...particle, depth: particle.depth + depthDelta}
          : particle
      }),
    }
  }),
  facet: "structure",
  label: `move atom ${darkParticleId} -> parent ${toParentDarkParticleId}`,
  structural: true,
})
