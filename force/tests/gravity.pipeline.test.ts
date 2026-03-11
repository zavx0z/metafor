import { afterEach, beforeAll, describe, expect, test } from "bun:test"
import { GPU } from "@boundary/matrix"
import { deriveMatrixData } from "@boundary/matrix/gpu/derived"
import { boundary$ } from "../../boundary/boundary"
import { parse } from "@metafor/template"
import { setupDevice } from "fixture/bunWebGPU"
import {
  buildStrongEntanglement,
  createActor,
  flattenGravity,
  force$,
  narrowEntanglementMembershipToBoundary,
  projectEntanglementToBoundary,
  updateBoundary,
} from "../index"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

afterEach(() => {
  force$.reset()
})

describe("gravity entanglement pipeline", () => {
  test("actor-only gravity projection не зависит от HTML layout wrappers", () => {
    const plain = parse<any>(
      ({ html, fields }) => html`
        ${fields.gate
          ? html`
              <meta-parent fields=${fields.shared}>
                ${fields.items.map((item: any) => html`<meta-child fields=${item.shared} />`)}
              </meta-parent>
            `
          : html`<meta-fallback fields=${fields.local} />`}
      `,
    )
    const wrapped = parse<any>(
      ({ html, fields }) => html`
        <div class="layout">
          <section>
            ${fields.gate
              ? html`
                  <div>
                    <meta-parent fields=${fields.shared}>
                      <span>
                        ${fields.items.map((item: any) => html`<meta-child fields=${item.shared} />`)}
                      </span>
                    </meta-parent>
                  </div>
                `
              : html`<aside><meta-fallback fields=${fields.local} /></aside>`}
          </section>
        </div>
      `,
    )

    const plainGraph = flattenGravity(plain)
    const wrappedGraph = flattenGravity(wrapped)

    expect(plainGraph.actors.map((actor) => actor.key)).toEqual(wrappedGraph.actors.map((actor) => actor.key))
    expect(plainGraph.payloads.map((payload) => payload.semanticKey)).toEqual(
      wrappedGraph.payloads.map((payload) => payload.semanticKey),
    )
    expect(plainGraph.scopes.map((scope) => scope.key)).toEqual(wrappedGraph.scopes.map((scope) => scope.key))
  })

  test("flattened graph preserves explicit gravity payload semantics", () => {
    const gravity = parse<any>(
      ({ html, fields }) => html`
        ${fields.gate
          ? html`
              <meta-parent fields=${fields.shared}>
                ${fields.items.map((item: any) => html`<meta-child fields=${item.shared} />`)}
              </meta-parent>
            `
          : html`<meta-fallback fields=${fields.local} />`}
      `,
    )

    const graph = flattenGravity(gravity)

    expect(graph.actors).toHaveLength(3)
    expect(graph.scopes.map((scope) => scope.kind)).toEqual(["cond", "map"])
    expect(graph.payloads.some((payload) => payload.kind === "scope" && payload.semanticKey.includes("/fields/gate"))).toBe(true)
    expect(graph.payloads.some((payload) => payload.kind === "fields" && payload.semanticKey.includes("/fields/shared"))).toBe(
      true,
    )
    expect(graph.actors[1]!.key).toBe("root/cond[0]/meta:meta-parent[0]/map[0]/meta:meta-child[0]")
    expect(graph.actors[1]!.entanglementPayloadIds.length).toBeGreaterThan(graph.actors[1]!.payloadIds.length)
  })

  test("strong builds blocks from explicit bindings and survives actor-count mismatch", () => {
    const gravity = parse<{ shared: number }>(
      ({ html, fields }) => html`
        <meta-a fields=${fields.shared}>
          <meta-b fields=${fields.shared} />
          <meta-c fields=${fields.shared} />
        </meta-a>
      `,
    )

    const graph = flattenGravity(gravity)
    const plan = buildStrongEntanglement(graph, [
      {
        actorId: "runtime-b",
        braneIndex: 1,
        fieldNames: ["hp", "mana"],
        binding: {
          actorKey: "root/meta:meta-a[0]/meta:meta-b[0]",
          fieldMap: { shared: "hp" },
        },
      },
      {
        actorId: "runtime-c",
        braneIndex: 4,
        fieldNames: ["hp", "energy"],
        binding: {
          actorKey: "root/meta:meta-a[0]/meta:meta-c[0]",
          fieldMap: { shared: "hp" },
        },
      },
    ])

    const projection = narrowEntanglementMembershipToBoundary(plan, new Map([
      ["hp", 0],
      ["mana", 1],
      ["energy", 2],
    ]))

    expect(plan.bindings).toHaveLength(2)
    expect(plan.membershipBlocks).toHaveLength(1)
    expect(plan.membershipBlocks[0]!.braneIndices).toEqual([1, 4])
    expect(plan.membershipBlocks[0]!.membership).toEqual({
      semanticKeys: ["fields:/fields/shared:_[0]"],
      scopeIds: [],
      payloadIds: ["payload:0", "payload:1", "payload:2"],
    })
    expect(plan.membershipBlocks[0]!.readiness).toEqual({
      sharedFieldNames: ["hp"],
      boundaryMaterializable: true,
    })
    expect(plan.membershipBlocks[0]!.fields).toEqual([
      {
        fieldName: "hp",
        fieldRef: "shared",
        payloadIds: ["payload:0", "payload:1", "payload:2"],
        semanticKeys: ["fields:/fields/shared:_[0]"],
        representativeBraneIndex: 1,
      },
    ])
    expect(projection.blocks).toEqual([
      {
        key: "1,4",
        braneIndices: [1, 4],
        fields: [
          {
            fieldIndex: 0,
            fieldName: "hp",
            payloadIds: ["payload:0", "payload:1", "payload:2"],
            semanticKeys: ["fields:/fields/shared:_[0]"],
            representativeBraneIndex: 1,
          },
        ],
      },
    ])
  })

  test("strong keeps gravity-driven membership even when shared fields are not boundary-ready yet", () => {
    const gravity = parse<{ shared: number }>(
      ({ html, fields }) => html`
        <meta-a fields=${fields.shared}>
          <meta-b fields=${fields.shared} />
          <meta-c fields=${fields.shared} />
        </meta-a>
      `,
    )

    const graph = flattenGravity(gravity)
    const plan = buildStrongEntanglement(graph, [
      {
        actorId: "runtime-b",
        braneIndex: 0,
        fieldNames: ["hp"],
        binding: {
          actorKey: "root/meta:meta-a[0]/meta:meta-b[0]",
          fieldMap: { shared: "hp" },
        },
      },
      {
        actorId: "runtime-c",
        braneIndex: 3,
        fieldNames: ["energy"],
        binding: {
          actorKey: "root/meta:meta-a[0]/meta:meta-c[0]",
          fieldMap: { shared: "energy" },
        },
      },
    ])

    expect(plan.membershipBlocks).toHaveLength(1)
    expect(plan.membershipBlocks[0]!.braneIndices).toEqual([0, 3])
    expect(plan.membershipBlocks[0]!.membership.semanticKeys).toEqual(["fields:/fields/shared:_[0]"])
    expect(plan.membershipBlocks[0]!.readiness).toEqual({
      sharedFieldNames: [],
      boundaryMaterializable: false,
    })
    expect(plan.membershipBlocks[0]!.fields).toEqual([])
    expect(projectEntanglementToBoundary(plan, new Map([["hp", 0], ["energy", 1]])).blocks).toEqual([])
  })

  test("updateBoundary доводит gravity-derived entanglement до matrix-ready heap через explicit bindings", async () => {
    const gravity = parse<{ shared: number }>(
      ({ html, fields }) => html`
        <meta-a fields=${fields.shared}>
          <meta-b fields=${fields.shared} />
          <meta-c fields=${fields.shared} />
        </meta-a>
      `,
    )

    createActor({
      uuid: "actor-b",
      fields: { hp: { type: "number" }, mana: { type: "number" } },
      values: { hp: 100, mana: 10 },
      superposition: { IDLE: null },
      gravity: {
        actorKey: "root/meta:meta-a[0]/meta:meta-b[0]",
        fieldMap: { shared: "hp" },
      },
    })
    createActor({
      uuid: "actor-c",
      fields: { hp: { type: "number" }, energy: { type: "number" } },
      values: { hp: 100, energy: 20 },
      superposition: { IDLE: null },
      gravity: {
        actorKey: "root/meta:meta-a[0]/meta:meta-c[0]",
        fieldMap: { shared: "hp" },
      },
    })

    await updateBoundary({ gravity })

    const derived = deriveMatrixData(boundary$)
    const [firstPtr, secondPtr] = derived.blockPtrs

    expect(derived.heap[firstPtr!]!).toBe(1)
    expect(derived.heap[firstPtr! + 1]!).toBe(1)
    expect(derived.heap[secondPtr!]!).toBe(1)
    expect(derived.heap[secondPtr! + 1]!).toBe(1)
  })
})
