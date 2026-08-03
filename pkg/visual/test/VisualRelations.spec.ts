import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {buildVisualRelationEdges} from "../src/VisualRelations.ts"
import {visualCausalMaterial} from "../src/VisualMaterialSpec.ts"

const color = [0.2, 0.7, 1] as const

describe("production Visual relation geometry", () => {
  test("keeps Process dependency facts without drawing closed center loops", () => {
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
        {
          relationChannelId: "relation:reaction/read",
          parentDarkParticleId: 2,
          relationKind: "reaction-read",
          fromKind: "orbital",
          fromId: "orbital:left",
          toKind: "orbital",
          toId: "orbital:right",
          active: true,
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

    expect(edges).toHaveLength(1)
    expect(edges[0]!.relationChannelId).toBe("relation:reaction/read")
    const read = edges[0]!.path
    expect(read).toHaveLength(129)
    expect(read[0]).toEqual({x: -500, y: 0, z: 0})
    expect(read[32]).toEqual({x: 0, y: 0, z: 500})
    expect(read[64]).toEqual({x: 500, y: 0, z: 0})
    expect(read[96]).toEqual({x: 0, y: 0, z: -500})
    expect(read[128]).toEqual(read[0])
    expect(edges[0]!.material).toMatchObject({
      color: [0.37, 0.89, 1, 0.78],
      glowColor: [0.37, 0.89, 1, 0.26],
      glowIntensity: 1.9,
      opacity: 1,
    })
  })

  test("does not draw an entanglement already collapsed into one shared marker", () => {
    const manifest: BulkManifest = {
      rootSrc: "owner/root",
      darkParticles: [
        {
          darkParticleId: 2,
          parentDarkParticleId: null,
          darkParticleKind: "atom",
          src: "owner/root",
          metaSrc: "owner/root",
          label: "root",
          depth: 0,
          darkParticleOrder: 0,
        },
        {
          darkParticleId: 4,
          parentDarkParticleId: 2,
          darkParticleKind: "atom",
          src: "owner/child",
          metaSrc: "owner/child",
          label: "child",
          depth: 1,
          darkParticleOrder: 0,
        },
      ],
      fieldParticles: [],
      relationChannels: [{
        relationChannelId: "entanglement/root/to/child",
        parentDarkParticleId: 2,
        relationKind: "field-entanglement",
        fromKind: "field",
        fromId: "field:root",
        toKind: "field",
        toId: "field:child",
        active: true,
      }],
    }
    const material = visualCausalMaterial(color, false, true)
    expect(buildVisualRelationEdges(manifest, {
      fields: [{
        color,
        fieldIds: [1, 2],
        fieldKeys: ["root", "child"],
        fieldParticleIds: ["field:root", "field:child"],
        fieldParticleKind: "string",
        material,
        ownerDarkParticleId: 2,
        sourceOwnerDarkParticleIds: [2, 4],
        valueId: 7,
        valueText: "shared",
        radius: 1,
        x: 0,
        y: 0,
        z: 0,
      }],
      fieldProxies: [],
      orbitals: [],
    })).toEqual([])
  })
})
