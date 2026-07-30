import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {buildVisualRelationEdges} from "./VisualRelations.ts"
import {visualCausalMaterial} from "./VisualMaterialSpec.ts"

const color = [0.2, 0.7, 1] as const

describe("production Visual relation geometry", () => {
  test("preserves the closed two-sided elliptic channel and minor-axis cap", () => {
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
      relationChannels: [{
        relationChannelId: "relation:process",
        parentDarkParticleId: 2,
        relationKind: "process-read",
        fromKind: "orbital",
        fromId: "orbital:left",
        toKind: "orbital",
        toId: "orbital:right",
        active: true,
      }],
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

    expect(edges).toHaveLength(1)
    const path = edges[0]!.path
    expect(path).toHaveLength(65)
    expect(path[0]).toEqual({x: -500, y: 0, z: 0})
    expect(path[32]).toMatchObject({x: 500, y: 0})
    expect(path[32]!.z).toBeCloseTo(0)
    expect(path[64]).toEqual(path[0])
    expect(path[16]!.x).toBeCloseTo(0)
    expect(path[16]!.y).toBeCloseTo(0)
    expect(path[16]!.z).toBeCloseTo(180)
    expect(path[48]!.x).toBeCloseTo(0)
    expect(path[48]!.y).toBeCloseTo(0)
    expect(path[48]!.z).toBeCloseTo(-180)
  })
})
