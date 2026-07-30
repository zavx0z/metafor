import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import {BulkProjectionStore} from "../../../bulk/projection.ts"
import {assertBulkVisualProjectionBoundary} from "../../../bulk/web/visual-projection.ts"
import {VISUAL_INACTIVE_STATE_BRANCH_OPACITY} from "../VisualMaterialSpec.ts"
import snapshotJson from "./fixture/monad-snapshot.json"
import {buildStateGraphFieldsStand} from "./StateGraphFieldsLab.ts"

describe("State Graph Fields playground stand", () => {
  test("runs root lada without nested Matter through the production Bulk projection", () => {
    const snapshot = snapshotJson as BulkObserverSnapshot
    const store = new BulkProjectionStore()
    store.hydrate(structuredClone(snapshot.projection))
    const projection = store.view()
    const projectionBefore = structuredClone(projection)

    const stand = buildStateGraphFieldsStand(projection, snapshot.rootSrc)

    expect(projection).toEqual(projectionBefore)
    expect(stand.graph).toMatchObject({
      atomId: 2,
      atomLabel: "lada",
      src: "zavx0z/lada",
      states: {length: 4},
      sleeves: {length: 5},
    })
    expect(stand.manifest.darkParticles).toEqual([
      expect.objectContaining({
        darkParticleId: stand.rootDarkParticleId,
        darkParticleKind: "atom",
        parentDarkParticleId: null,
        src: snapshot.rootSrc,
      }),
    ])
    for (const values of [
      stand.manifest.fieldParticles,
      stand.manifest.orbitalParticles ?? [],
      stand.manifest.transitionChannels ?? [],
      stand.manifest.fieldProxies ?? [],
      stand.manifest.relationChannels ?? [],
    ]) {
      expect(values.every((value) =>
        value.parentDarkParticleId === stand.rootDarkParticleId
      )).toBe(true)
    }
    expect(stand.manifest.fieldParticles).toHaveLength(21)
    expect(stand.visual.layoutSlug).toBe("centered-nested")
    expect(stand.visual.sourceStats).toMatchObject({
      rootSrc: snapshot.rootSrc,
      darkParticleCount: 1,
      fieldParticleCount: 21,
    })
    expect(stand.visual.manifest.darkParticles).toHaveLength(1)
    expect(stand.visual.manifest.darkParticles[0]?.darkParticleKind)
      .toBe("atom")
    expect(stand.visual.transitionPaths.every((path) =>
      path.path.length === 65
    )).toBe(true)
    expect(stand.visual.relationPaths.every((path) =>
      path.path.length === 129
    )).toBe(true)
    const renderedOrbitalById = new Map(
      stand.visual.manifest.orbitalParticles.map((particle) =>
        [particle.orbitalParticleId, particle] as const
      ),
    )
    const orbitalTorusById = new Map(
      stand.visual.orbitalTori.map((form) =>
        [form.orbitalParticleId, form] as const
      ),
    )
    const orbitalSphereIds = new Set(
      stand.visual.orbitalSpheres.map((form) => form.orbitalParticleId),
    )
    const renderedProxyById = new Map(
      stand.visual.manifest.fieldProxies.map((proxy) =>
        [proxy.fieldProxyId, proxy] as const
      ),
    )
    const proxySphereById = new Map(
      stand.visual.fieldProxySpheres.map((form) =>
        [form.fieldProxyId, form] as const
      ),
    )
    const processes = stand.manifest.orbitalParticles?.filter((particle) =>
      particle.orbitalParticleKind === "process"
    ) ?? []
    const processDeclarationCountByStateId = new Map<number, number>()
    for (const process of projection.processes.filter((candidate) =>
      candidate.wimp === snapshot.rootSrc &&
      candidate.descriptor.type === "action"
    )) {
      const stateId = stand.graph.states.find((state) =>
        state.name === process.state
      )?.id
      expect(stateId).toBeDefined()
      processDeclarationCountByStateId.set(
        stateId!,
        (processDeclarationCountByStateId.get(stateId!) ?? 0) + 1,
      )
    }
    const processCountByAnchor = Map.groupBy(
      processes,
      (process) => process.anchorStateOrbitalParticleId,
    )
    const stateOccurrences = stand.manifest.orbitalParticles?.filter(
      (particle) => particle.orbitalParticleKind === "state",
    ) ?? []
    expect(processes).toHaveLength(
      stateOccurrences.reduce(
        (count, state) =>
          count +
          (processDeclarationCountByStateId.get(state.sourceId) ?? 0),
        0,
      ),
    )
    for (const state of stateOccurrences) {
      expect(
        processCountByAnchor.get(state.orbitalParticleId)?.length ?? 0,
      ).toBe(processDeclarationCountByStateId.get(state.sourceId) ?? 0)
    }
    for (const process of processes) {
      const processRender = renderedOrbitalById.get(
        process.orbitalParticleId,
      )!
      const processTorus = orbitalTorusById.get(
        process.orbitalParticleId,
      )!
      const stateRender = renderedOrbitalById.get(
        process.anchorStateOrbitalParticleId!,
      )!
      const stateTorus = orbitalTorusById.get(
        process.anchorStateOrbitalParticleId!,
      )!
      expect(processTorus).toBeDefined()
      expect(orbitalSphereIds.has(process.orbitalParticleId)).toBe(false)
      const processOffset = {
        x: processRender.localX - stateRender.localX,
        y: processRender.localY - stateRender.localY,
        z: processRender.localZ - stateRender.localZ,
      }
      const processRadialDistance = Math.hypot(
        processOffset.x,
        processOffset.y,
      )
      expect(processRadialDistance).toBeCloseTo(stateTorus.radius)
      expect(Math.hypot(
        processOffset.x,
        processOffset.y,
        processOffset.z,
      )).toBeGreaterThan(0)
      expect(
        Math.hypot(
          processRadialDistance - stateTorus.radius,
          processOffset.z,
        ) +
          processTorus.radius +
          processTorus.tube,
      ).toBeLessThan(stateTorus.tube)

      const proxyIds = [...new Set(
        (stand.manifest.relationChannels ?? []).flatMap((channel) => {
          if (
            channel.relationKind !== "process-read" &&
            channel.relationKind !== "process-write"
          ) return []
          if (
            channel.fromKind === "field-proxy" &&
            channel.toId === process.orbitalParticleId
          ) return [channel.fromId]
          if (
            channel.toKind === "field-proxy" &&
            channel.fromId === process.orbitalParticleId
          ) return [channel.toId]
          return []
        }),
      )]
      expect(proxyIds).toHaveLength(21)
      const proxyCenters = proxyIds.map((proxyId) => {
        const proxy = renderedProxyById.get(proxyId)!
        const sphere = proxySphereById.get(proxyId)!
        expect(sphere).toBeDefined()
        expect(
          Math.hypot(
            proxy.localX - processRender.localX,
            proxy.localY - processRender.localY,
            proxy.localZ - processRender.localZ,
          ) + sphere.radius,
        ).toBeLessThan(processTorus.radius - processTorus.tube)
        return proxy
      })
      expect(
        proxyCenters.reduce((sum, proxy) => sum + proxy.localX, 0) /
          proxyCenters.length,
      ).toBeCloseTo(processRender.localX)
      expect(
        proxyCenters.reduce((sum, proxy) => sum + proxy.localY, 0) /
          proxyCenters.length,
      ).toBeCloseTo(processRender.localY)
      expect(
        proxyCenters.reduce((sum, proxy) => sum + proxy.localZ, 0) /
          proxyCenters.length,
      ).toBeCloseTo(processRender.localZ)
    }
    const orbitalMaterialById = new Map(
      stand.visual.orbitalMaterials.map((entry) =>
        [entry.orbitalParticleId, entry.material] as const
      ),
    )
    const proxyMaterialById = new Map(
      stand.visual.fieldProxyMaterials.map((entry) =>
        [entry.fieldProxyId, entry.material] as const
      ),
    )
    const renderedStateById = new Map(
      stand.visual.manifest.orbitalParticles.flatMap((particle) =>
        particle.orbitalParticleKind === "state"
          ? [[particle.orbitalParticleId, particle] as const]
          : []
      ),
    )
    expect([...renderedStateById.values()].some((state) => state.active))
      .toBe(true)
    expect([...renderedStateById.values()].some((state) => !state.active))
      .toBe(true)
    for (const [stateId, state] of renderedStateById) {
      if (!state.active) {
        expect(orbitalMaterialById.get(stateId)?.opacity)
          .toBe(VISUAL_INACTIVE_STATE_BRANCH_OPACITY)
      }
    }
    for (const orbital of stand.visual.manifest.orbitalParticles) {
      if (orbital.anchorStateOrbitalParticleId === null) continue
      const state = renderedStateById.get(
        orbital.anchorStateOrbitalParticleId,
      )
      if (state && !state.active) {
        expect(
          orbitalMaterialById.get(orbital.orbitalParticleId)?.opacity,
        ).toBe(VISUAL_INACTIVE_STATE_BRANCH_OPACITY)
      }
    }
    for (const proxy of stand.visual.manifest.fieldProxies) {
      const state = renderedStateById.get(proxy.stateOrbitalParticleId)
      if (state && !state.active) {
        expect(proxyMaterialById.get(proxy.fieldProxyId)?.opacity)
          .toBe(VISUAL_INACTIVE_STATE_BRANCH_OPACITY)
      }
    }
    const transitionPathById = new Map(
      stand.visual.transitionPaths.map((path) =>
        [path.transitionChannelId, path] as const
      ),
    )
    for (const channel of stand.visual.manifest.transitionChannels) {
      if (!channel.active) {
        expect(
          transitionPathById.get(channel.transitionChannelId)
            ?.material.opacity,
        ).toBe(VISUAL_INACTIVE_STATE_BRANCH_OPACITY)
      }
    }
    const relationPathById = new Map(
      stand.visual.relationPaths.map((path) =>
        [path.relationChannelId, path] as const
      ),
    )
    const endpointStateId = (
      kind: "field" | "field-proxy" | "orbital",
      id: string,
    ): string | null => {
      if (kind === "field") return null
      if (kind === "field-proxy") {
        return renderedProxyById.get(id)?.stateOrbitalParticleId ?? null
      }
      const orbital = renderedOrbitalById.get(id)
      return orbital?.orbitalParticleKind === "state"
        ? orbital.orbitalParticleId
        : orbital?.anchorStateOrbitalParticleId ?? null
    }
    for (const channel of stand.visual.manifest.relationChannels) {
      const stateId =
        endpointStateId(channel.fromKind, channel.fromId) ??
        endpointStateId(channel.toKind, channel.toId)
      const state = stateId === null
        ? undefined
        : renderedStateById.get(stateId)
      if (state && !state.active) {
        expect(
          relationPathById.get(channel.relationChannelId)?.material.opacity,
        ).toBe(VISUAL_INACTIVE_STATE_BRANCH_OPACITY)
      }
    }
    expect(() => assertBulkVisualProjectionBoundary(stand.visual))
      .not.toThrow()
  })
})
