import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {buildVisualRelationEdges} from "./VisualRelations.ts"
import {visualCausalMaterial} from "./VisualMaterialSpec.ts"

const color = [0.2, 0.7, 1] as const

describe("production Visual relation geometry", () => {
  test("uses two complete Transition Hermite profiles for every relation", () => {
    const manifest: BulkManifest = {
      rootSrc: "owner/root",
      darkParticles: [{
        darkParticleId: 2,
        parentDarkParticleId: null,
        darkParticleKind: "atom",
        src: "owner/root",
        metaSrc: "owner/root",
        label: "root",
        depth: 0,
        darkParticleOrder: 0,
      }],
      fieldParticles: [],
      relationChannels: [
        {
          relationChannelId: "relation:process/read",
          parentDarkParticleId: 2,
          relationKind: "process-read",
          fromKind: "orbital",
          fromId: "orbital:left",
          toKind: "orbital",
          toId: "orbital:right",
          active: true,
        },
        {
          relationChannelId: "relation:process/write",
          parentDarkParticleId: 2,
          relationKind: "process-write",
          fromKind: "orbital",
          fromId: "orbital:right",
          toKind: "orbital",
          toId: "orbital:left",
          active: false,
        },
      ],
    }
    const form = {kind: "sphere", radius: 1} as const
    const material = visualCausalMaterial(color, false, true)
    const edges = buildVisualRelationEdges(manifest, {
      fields: [],
      fieldProxies: [],
      orbitals: [
        {
          anchorStateOrbitalParticleId: null,
          color,
          form,
          material,
          orbitalParticleId: "orbital:left",
          ownerDarkParticleId: 2,
          x: -500,
          y: 0,
          z: 0,
        },
        {
          anchorStateOrbitalParticleId: null,
          color,
          form,
          material,
          orbitalParticleId: "orbital:right",
          ownerDarkParticleId: 2,
          x: 500,
          y: 0,
          z: 0,
        },
      ],
    })

    expect(edges).toHaveLength(2)
    const read = edges[0]!.path
    const write = edges[1]!.path
    expect(read).toHaveLength(129)
    expect(write).toHaveLength(129)
    expect(read[0]).toEqual({x: -500, y: 0, z: 0})
    expect(read[32]).toEqual({x: 0, y: 0, z: 500})
    expect(read[64]).toEqual({x: 500, y: 0, z: 0})
    expect(read[96]).toEqual({x: 0, y: 0, z: -500})
    expect(read[128]).toEqual(read[0])
    expect(write[0]).toEqual({x: 500, y: 0, z: 0})
    expect(write[32]).toEqual({x: 0, y: 0, z: 500})
    expect(write[64]).toEqual({x: -500, y: 0, z: 0})
    expect(write[96]).toEqual({x: 0, y: 0, z: -500})
    expect(write[128]).toEqual(write[0])
    expect(edges[0]!.material).toMatchObject({
      color: [0.37, 0.89, 1, 0.78],
      glowColor: [0.37, 0.89, 1, 0.26],
      glowIntensity: 1.9,
      opacity: 1,
    })
    expect(edges[1]!.material).toMatchObject({
      color: [1, 0.54, 0.17, 1],
      glowColor: [1, 0.54, 0.17, 2 / 9],
      glowIntensity: 0.45,
      opacity: 0.18,
    })
  })
})
