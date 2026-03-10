import { afterEach, beforeAll, describe, expect, test } from "bun:test"
import { GPU } from "@boundary/matrix"
import { getMatrixState } from "@metafor/boundary"
import { parse } from "@metafor/template"
import { setupDevice } from "fixture/bunWebGPU"
import {
  buildStrongEntanglement,
  createActor,
  flattenGravity,
  force$,
  projectEntanglementToBoundary,
  setGravitySource,
  updateBoundary,
} from "../index"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

afterEach(() => {
  force$.reset()
})

describe("gravity entanglement pipeline", () => {
  test("flattenGravity сохраняет actor-only scopes и connectivity", () => {
    const gravity = parse<any>(
      ({ html, fields }) => html`
        <div>
          ${fields.gate
            ? html`
                <meta-parent fields=${fields.shared}>
                  ${fields.items.map((item: any) => html`<meta-child fields=${item.shared} />`)}
                </meta-parent>
              `
            : html`<meta-fallback fields=${fields.local} />`}
        </div>
      `,
    )

    const flattened = flattenGravity(gravity)

    expect(flattened.scopes.map((scope) => scope.kind)).toEqual(["cond", "map"])
    expect(flattened.actors).toHaveLength(3)
    expect(flattened.actors[0]!.fieldRefs).toContain("gate")
    expect(flattened.actors[0]!.fieldRefs).toContain("shared")
    expect(flattened.actors[1]!.parentActorId).toBe(flattened.actors[0]!.id)
    expect(flattened.actors[1]!.scopeIds).toEqual(["scope:0", "scope:1"])
    expect(flattened.actors[1]!.fieldRefs).toContain("items")
    expect(flattened.links.some((link) => link.kind === "hierarchy" && link.from === "actor:0" && link.to === "actor:1")).toBe(
      true,
    )
  })

  test("strong строит blocks и boundary projection из flattened gravity", () => {
    const gravity = parse<{ shared: number }>(
      ({ html, fields }) => html`
        <meta-a fields=${fields.shared}>
          <meta-b fields=${fields.shared} />
        </meta-a>
      `,
    )

    const flattened = flattenGravity(gravity)
    const plan = buildStrongEntanglement(flattened, [
      { actorId: "a", braneIndex: 0, fieldNames: ["shared", "mana"] },
      { actorId: "b", braneIndex: 1, fieldNames: ["shared", "mana"] },
    ])
    const projection = projectEntanglementToBoundary(plan, new Map([
      ["shared", 0],
      ["mana", 1],
    ]))

    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]!.braneIndices).toEqual([0, 1])
    expect(plan.blocks[0]!.fieldNames).toEqual(["shared"])
    expect(projection.blocks).toEqual([
      {
        key: "0,1",
        braneIndices: [0, 1],
        fieldIndices: [0],
      },
    ])
  })

  test("updateBoundary доводит gravity-derived entanglement до matrix-ready heap", async () => {
    const gravity = parse<{ shared: number }>(
      ({ html, fields }) => html`
        <meta-a fields=${fields.shared}>
          <meta-b fields=${fields.shared} />
        </meta-a>
      `,
    )

    setGravitySource(gravity)

    createActor({
      uuid: "actor-a",
      fields: { shared: { type: "number" }, mana: { type: "number" } },
      values: { shared: 100, mana: 10 },
      superposition: { IDLE: null },
    })
    createActor({
      uuid: "actor-b",
      fields: { shared: { type: "number" }, mana: { type: "number" } },
      values: { shared: 100, mana: 20 },
      superposition: { IDLE: null },
    })

    await updateBoundary()

    const matrixState = getMatrixState()
    const [firstPtr, secondPtr] = matrixState.metadata.braneBlockPtrs

    expect(matrixState.heap[firstPtr!]!).toBe(1)
    expect(matrixState.heap[firstPtr! + 1]!).toBe(1)
    expect(matrixState.heap[secondPtr!]!).toBe(1)
    expect(matrixState.heap[secondPtr! + 1]!).toBe(1)
  })
})
