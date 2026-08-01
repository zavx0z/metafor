import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import {BulkVisualSceneLifecycle} from "bulk/visual"
import {VISUAL_INACTIVE_STATE_BRANCH_OPACITY} from "../src/VisualMaterialSpec.ts"
import snapshotJson from "./fixture/monad-snapshot.json"
import {buildStateGraphActivityStand} from "./StateGraphActivityLab.ts"

const activityStand = () => {
  const snapshot = snapshotJson as BulkObserverSnapshot
  const lifecycle = new BulkVisualSceneLifecycle()
  lifecycle.prepare(structuredClone(snapshot))
  const projection = lifecycle.state().projection
  return {
    projection,
    rootSrc: snapshot.rootSrc,
    stand: buildStateGraphActivityStand(lifecycle),
  }
}

describe("State Graph Activity playground stand", () => {
  test("compares one real multi-sleeve graph with and without its current State", () => {
    const {projection, stand} = activityStand()
    const rootAtom = projection.atoms.find((atom) =>
      atom.wimp === stand.active.manifest.rootSrc &&
      atom.parentAtom === null &&
      atom.parentTopology === null
    )
    expect(rootAtom).toBeDefined()
    const rootState = projection.atomStates.find((entry) =>
      entry.atom === rootAtom!.id
    )
    expect(rootState?.state).not.toBeNull()

    expect(stand.active.projection).toEqual(projection)
    expect(stand.inactive.projection).toEqual({
      ...projection,
      atomStates: projection.atomStates.map((entry) =>
        entry.atom === rootAtom!.id ? {...entry, state: null} : entry
      ),
    })
    const activeStates = (stand.active.manifest.orbitalParticles ?? []).filter(
      (particle) => particle.orbitalParticleKind === "state",
    )
    const inactiveStates = (
      stand.inactive.manifest.orbitalParticles ?? []
    ).filter(
      (particle) => particle.orbitalParticleKind === "state",
    )
    expect(activeStates).toHaveLength(13)
    expect(inactiveStates).toHaveLength(13)
    expect(
      new Set(activeStates.map((state) => state.sleeveRootStateId)).size,
    ).toBeGreaterThan(1)
    expect(
      [...new Set(
        activeStates
          .filter((state) => state.active)
          .map((state) => state.sleeveRootStateId),
      )],
    ).toEqual([rootState!.state])
    expect(
      activeStates.filter((state) => state.current),
    ).toEqual([
      expect.objectContaining({
        active: true,
        sourceId: rootState!.state,
        sleeveRootStateId: rootState!.state,
      }),
    ])
    expect(inactiveStates.every((state) =>
      !state.active && !state.current
    )).toBe(true)

    for (const scenario of [stand.active, stand.inactive]) {
      expect(scenario.manifest.darkParticles).toHaveLength(1)
      expect(scenario.manifest.fieldParticles).toHaveLength(21)
      expect((scenario.manifest.orbitalParticles ?? []).filter((particle) =>
        particle.orbitalParticleKind === "process"
      )).toHaveLength(7)
      expect(scenario.manifest.transitionChannels).toHaveLength(14)
      expect(scenario.manifest.fieldProxies).toHaveLength(160)
      expect(scenario.visual.orbitalTori).toHaveLength(20)
      expect(scenario.visual.transitionPaths).toHaveLength(14)
      expect(scenario.visual.relationPaths).toHaveLength(331)
    }

    const geometry = (scenario: typeof stand.active) => ({
      orbitals: scenario.visual.manifest.orbitalParticles.map((particle) => ({
        id: particle.orbitalParticleId,
        x: particle.localX,
        y: particle.localY,
        z: particle.localZ,
      })),
      orbitalTori: scenario.visual.orbitalTori,
      proxies: scenario.visual.manifest.fieldProxies.map((proxy) => ({
        id: proxy.fieldProxyId,
        x: proxy.localX,
        y: proxy.localY,
        z: proxy.localZ,
      })),
      proxySpheres: scenario.visual.fieldProxySpheres,
      relations: scenario.visual.relationPaths.map((path) => path.points),
      transitions: scenario.visual.transitionPaths.map((path) => path.points),
    })
    expect(geometry(stand.active)).toEqual(geometry(stand.inactive))
  })

  test("dims sibling sleeves and every component when current State is absent", () => {
    const {stand: {active, inactive}} = activityStand()
    const inactiveOpacity = VISUAL_INACTIVE_STATE_BRANCH_OPACITY

    for (const materials of [
      active.visual.orbitalMaterials.map((entry) => entry.material.opacity),
      active.visual.fieldProxyMaterials.map((entry) =>
        entry.material.opacity
      ),
      active.visual.transitionPaths.map((path) => path.material.opacity),
      active.visual.relationPaths.map((path) => path.material.opacity),
    ]) {
      expect(materials.some((opacity) => opacity > inactiveOpacity)).toBe(true)
      expect(materials.some((opacity) => opacity === inactiveOpacity))
        .toBe(true)
    }

    for (const opacity of [
      ...inactive.visual.orbitalMaterials.map((entry) =>
        entry.material.opacity
      ),
      ...inactive.visual.fieldProxyMaterials.map((entry) =>
        entry.material.opacity
      ),
      ...inactive.visual.transitionPaths.map((path) =>
        path.material.opacity
      ),
      ...inactive.visual.relationPaths.map((path) =>
        path.material.opacity
      ),
    ]) {
      expect(opacity).toBe(inactiveOpacity)
    }
  })
})
