import { describe, expect, test, beforeEach } from "bun:test"
import { MetaFor, compileLocalTopologyFragment } from "../../metafor/dsl/metafor.ts"

import { topology$ } from "./store.ts"

beforeEach(() => {
  topology$.reset()
})

describe("dark/ap topology$", () => {
  test("ингестит локальные фрагменты по одному и различает object identity и placement identity", () => {
    const rootMeta = MetaFor("root")
      .fields((field) => ({
        enabled: field.boolean.required(true),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`
        ${value.enabled && html`
          <meta-for src="child/shared"></meta-for>
          <meta-for src="child/shared"></meta-for>
        `}
      `)
      .bulk()

    const childMeta = MetaFor("child")
      .fields((field) => ({
        ready: field.boolean.required(true),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`
        ${value.ready && html`<meta-for src="leaf/static"></meta-for>`}
      `)
      .bulk()

    const rootFragment = compileLocalTopologyFragment(rootMeta)
    const childFragment = compileLocalTopologyFragment(childMeta)

    const rootIngest = topology$.ingestFragment("root/meta", rootFragment)
    expect(rootIngest.referenceIds).toHaveLength(2)

    for (const referenceId of rootIngest.referenceIds) {
      const reference = topology$.getReference(referenceId)!
      topology$.ingestFragment("child/shared", childFragment, {
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })
    }

    const childObjectId = "child/shared#f0"
    const childPlacements = topology$.getPlacementsByObject(childObjectId)

    expect(topology$.getObject(childObjectId)).toBeDefined()
    expect(childPlacements).toHaveLength(2)
    expect(new Set(childPlacements.map((placement) => placement.address)).size).toBe(2)
    expect(topology$.getReferencesBySource("child/shared")).toHaveLength(2)

    const entanglementAddresses = childPlacements.map(
      (placement) => `ent:${childObjectId}@${placement.address}`,
    )
    expect(topology$.getEntanglementByAddress(entanglementAddresses[0]!)).toBeDefined()
    expect(topology$.getEntanglementByAddress(entanglementAddresses[1]!)).toBeDefined()
    expect(entanglementAddresses[0]).not.toBe(entanglementAddresses[1])
  })

  test("строит глобальный адрес и поддерживает lookup по адресу и meta source", () => {
    const meta = MetaFor("lookup")
      .fields((field) => ({
        mode: field.enum("a", "b").required("a"),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`
        ${value.mode && html`
          <meta-for src=${`child/${value.mode}`}></meta-for>
        `}
      `)
      .bulk()

    const fragment = compileLocalTopologyFragment(meta)
    const ingested = topology$.ingestFragment("lookup/root", fragment)

    const rootPlacement = topology$.getPlacement(ingested.rootPlacementIds[0]!)
    expect(rootPlacement).toBeDefined()
    expect(rootPlacement?.address.startsWith("/w:lookup-root-0")).toBe(true)

    const lookedUp = topology$.getPlacementByAddress(rootPlacement!.address)
    expect(lookedUp?.id).toBe(rootPlacement?.id)

    expect(topology$.getReferencesBySource("child/a")).toHaveLength(1)
    expect(topology$.getReferencesBySource("child/b")).toHaveLength(1)
  })
})
