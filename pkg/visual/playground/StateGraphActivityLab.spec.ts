import {describe, expect, test} from "bun:test"
import {VISUAL_INACTIVE_STATE_BRANCH_OPACITY} from "../VisualMaterialSpec.ts"
import {buildStateGraphActivityStand} from "./StateGraphActivityLab.ts"

describe("State Graph Activity playground stand", () => {
  test("compares one exact production branch with activity as the only input", () => {
    const stand = buildStateGraphActivityStand()

    expect(stand.active.projection).toEqual({
      ...stand.inactive.projection,
      atomStates: [{atom: 1, state: 21}],
    })
    expect(stand.active.manifest.orbitalParticles).toContainEqual(
      expect.objectContaining({
        active: true,
        current: true,
        orbitalParticleKind: "state",
      }),
    )
    expect(stand.inactive.manifest.orbitalParticles).toContainEqual(
      expect.objectContaining({
        active: false,
        current: false,
        orbitalParticleKind: "state",
      }),
    )
    for (const scenario of [stand.active, stand.inactive]) {
      expect(scenario.manifest.darkParticles).toHaveLength(1)
      expect(scenario.manifest.orbitalParticles?.filter((particle) =>
        particle.orbitalParticleKind === "state"
      )).toHaveLength(1)
      expect(scenario.manifest.orbitalParticles?.filter((particle) =>
        particle.orbitalParticleKind === "process"
      )).toHaveLength(1)
      expect(scenario.manifest.transitionChannels).toHaveLength(1)
      expect(scenario.manifest.fieldProxies).toHaveLength(3)
      expect(scenario.visual.orbitalTori).toHaveLength(2)
      expect(scenario.visual.transitionPaths).toHaveLength(1)
      expect(scenario.visual.relationPaths).toHaveLength(5)
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
      relations: scenario.visual.relationPaths.map((path) => path.path),
      transitions: scenario.visual.transitionPaths.map((path) => path.path),
    })
    expect(geometry(stand.active)).toEqual(geometry(stand.inactive))
  })

  test("assigns one opacity to every component of the inactive branch", () => {
    const {active, inactive} = buildStateGraphActivityStand()
    const inactiveOpacity = VISUAL_INACTIVE_STATE_BRANCH_OPACITY

    expect(active.visual.orbitalMaterials.every((entry) =>
      entry.material.opacity > inactiveOpacity
    )).toBe(true)
    expect(active.visual.fieldProxyMaterials.every((entry) =>
      entry.material.opacity > inactiveOpacity
    )).toBe(true)
    expect(active.visual.transitionPaths.every((path) =>
      path.material.opacity === 1
    )).toBe(true)
    expect(active.visual.relationPaths.every((path) =>
      path.material.opacity === 1
    )).toBe(true)

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
