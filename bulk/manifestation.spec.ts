import {describe, expect, test} from "bun:test"
import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import {buildBulkManifestation} from "./manifestation.ts"

const SRC = "owner/project"

const createProjection = (): BulkRuntimeProjection => ({
  atoms: [
    {id: 17, parentAtom: null, parentTopology: null, wimp: SRC, position: 0},
  ],
  topologies: [],
  wimps: [{src: SRC, name: "Full screen"}],
  fields: [
    {id: 2, wimp: SRC, key: "title", type: "string", label: "Title"},
  ],
  states: [],
  transitions: [],
  conditions: [],
  processes: [],
  reactions: [],
  atomStates: [],
  fieldEnumVariants: [],
  atomValues: [],
  values: [],
  valueItems: [],
  matterParticles: [],
  matterTopologyBindingPaths: [],
  matterChildWimpBindingPaths: [],
})

describe("Boundary projection -> semantic Bulk manifestation", () => {
  test("keeps identity and values without render geometry", () => {
    const manifest = buildBulkManifestation(createProjection(), SRC)
    expect(manifest.darkParticles[0]).toMatchObject({
      darkParticleId: 34,
      darkParticleKind: "atom",
      parentDarkParticleId: null,
      src: SRC,
      metaSrc: SRC,
    })
    expect(manifest.fieldParticles[0]).toMatchObject({
      fieldId: 2,
      valueId: null,
      fieldKey: "title",
      parentDarkParticleId: 34,
    })
    expect(manifest.fieldParticles[0]?.fieldParticleId).not.toBe("2")
    for (const particle of [
      ...manifest.darkParticles,
      ...manifest.fieldParticles,
    ]) {
      expect(particle).not.toHaveProperty("localX")
      expect(particle).not.toHaveProperty("colorR")
      expect(particle).not.toHaveProperty("sphereRadius")
      expect(particle).not.toHaveProperty("torusRadius")
    }
  })

  test("materializes State occurrences, Transition conditions and proxies semantically", () => {
    const projection = createProjection()
    projection.states.push(
      {id: 21, wimp: SRC, name: "idle", position: 0},
      {id: 22, wimp: SRC, name: "ready", position: 1},
    )
    projection.transitions.push(
      {id: 31, wimp: SRC, fromState: 21, toState: 22, position: 0},
    )
    projection.conditions.push({
      id: 41,
      wimp: SRC,
      transition: 31,
      field: 2,
      position: 0,
      predicate: {eq: "go"},
    })
    projection.atomStates.push({atom: 17, state: 21})

    const manifest = buildBulkManifestation(projection, SRC)
    const states = manifest.orbitalParticles?.filter(
      (particle) => particle.orbitalParticleKind === "state",
    ) ?? []
    expect(states).toHaveLength(3)
    expect(states.some((particle) => particle.sourceId === 21 && particle.current)).toBe(true)
    expect(manifest.transitionChannels).toContainEqual(expect.objectContaining({
      sourceId: 31,
      conditionIds: [41],
      conditionFieldIds: [2],
    }))
    expect(manifest.fieldProxies).toHaveLength(1)
    expect(manifest.relationChannels).toContainEqual(expect.objectContaining({
      relationKind: "field-projection",
    }))
  })

  test("materializes Process in every exact occurrence of its State", () => {
    const projection = createProjection()
    projection.states.push(
      {id: 21, wimp: SRC, name: "idle", position: 0},
      {id: 22, wimp: SRC, name: "ready", position: 1},
    )
    projection.transitions.push(
      {id: 31, wimp: SRC, fromState: 21, toState: 22, position: 0},
    )
    projection.processes.push({
      id: 51,
      wimp: SRC,
      state: "ready",
      descriptor: {
        type: "action",
        key: "prepare",
        action: {readFields: [[2, "title"]]},
      },
    })
    projection.atomStates.push({atom: 17, state: 22})

    const manifest = buildBulkManifestation(projection, SRC)
    const readyOccurrences = manifest.orbitalParticles?.filter(
      (particle) =>
        particle.orbitalParticleKind === "state" &&
        particle.sourceId === 22,
    ) ?? []
    const processes = manifest.orbitalParticles?.filter(
      (particle) => particle.orbitalParticleKind === "process",
    ) ?? []

    expect(readyOccurrences).toHaveLength(2)
    expect(processes).toHaveLength(readyOccurrences.length)
    expect(new Set(processes.map((process) =>
      process.anchorStateOrbitalParticleId
    ))).toEqual(new Set(readyOccurrences.map((state) =>
      state.orbitalParticleId
    )))
    expect(processes.filter((process) => process.active)).toHaveLength(1)
    expect(manifest.relationChannels?.filter((channel) =>
      channel.relationKind === "process-read"
    )).toHaveLength(readyOccurrences.length)
  })

  test("selects only the requested root and its descendants", () => {
    const projection = createProjection()
    projection.wimps.push(
      {src: "owner/project/tree", name: "Tree"},
      {src: "owner/other", name: "Other"},
    )
    projection.atoms.push(
      {
        id: 18,
        parentAtom: 17,
        parentTopology: null,
        wimp: "owner/project/tree",
        position: 0,
      },
      {
        id: 99,
        parentAtom: null,
        parentTopology: null,
        wimp: "owner/other",
        position: 1,
      },
    )
    const manifest = buildBulkManifestation(projection, SRC)
    expect(manifest.darkParticles.map((particle) => particle.src)).toEqual([
      SRC,
      "owner/project/tree",
    ])
    expect(manifest.darkParticles[1]?.parentDarkParticleId).toBe(34)
  })

  test("does not substitute an unrelated root", () => {
    const manifest = buildBulkManifestation(
      createProjection(),
      "owner/missing",
    )
    expect(manifest.rootSrc).toBe("owner/missing")
    expect(manifest.darkParticles).toEqual([])
    expect(manifest.fieldParticles).toEqual([])
  })

  test("accepts only a verified promotion receipt for the promoted semantic root", () => {
    const projection = createProjection()
    projection.wimps.push({src: "owner/child", name: "Child"})
    projection.atoms = [{
      id: 18,
      parentAtom: null,
      parentTopology: null,
      wimp: "owner/child",
      position: 0,
    }]
    const receipt: BulkRootPromotionReceipt = {
      version: 1,
      kind: "root-promotion",
      verified: true,
      removedRootAtomId: 17,
      removedRootSrc: SRC,
      promotedAtomId: 18,
      promotedRootSrc: "owner/child",
      formerRootFrame: {
        localX: 10,
        localY: 20,
        localZ: 30,
        outerDiameterMm: 100,
      },
    }
    const promoted = buildBulkManifestation(projection, SRC, receipt)
    expect(promoted.rootSrc).toBe("owner/child")
    expect(promoted.darkParticles.map((particle) => particle.darkParticleId)).toEqual([36])

    const rejected = buildBulkManifestation(projection, SRC, {
      ...receipt,
      verified: false,
    } as unknown as BulkRootPromotionReceipt)
    expect(rejected.rootSrc).toBe(SRC)
    expect(rejected.darkParticles).toEqual([])
  })
})
