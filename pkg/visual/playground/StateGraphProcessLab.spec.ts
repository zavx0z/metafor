import {describe, expect, test} from "bun:test"
import {buildStateGraphProcessStand} from "./StateGraphProcessLab.ts"

describe("State Graph Process placement lab", () => {
  test("uses the recorded action Process with success and error handlers", () => {
    const stand = buildStateGraphProcessStand()

    expect(stand.process).toMatchObject({
      id: 12,
      ownerStateId: 19,
      ownerStateLabel: "обращение к модели",
    })
    expect(stand.handlers.map(({kind, fieldIds}) => ({kind, fieldIds})))
      .toEqual([
        {kind: "action", fieldIds: [45, 46, 47, 48, 49]},
        {kind: "success", fieldIds: [45, 47, 48, 49]},
        {kind: "error", fieldIds: [45, 49]},
      ])
  })

  test("places the complete Process Torus outside its owner State", () => {
    const stand = buildStateGraphProcessStand()
    const owner = stand.layout.nodes.find((node) =>
      node.id === stand.process.ownerNodeId
    )
    expect(owner).toBeDefined()

    const centerDistance = Math.hypot(
      stand.process.x - owner!.x,
      stand.process.y - owner!.y,
      stand.process.z - owner!.z,
    )
    expect(centerDistance).toBeGreaterThan(
      owner!.radius + stand.process.form.outerRadius,
    )
    expect(
      centerDistance - owner!.radius - stand.process.form.outerRadius,
    ).toBeCloseTo(2.2)
  })

  test("keeps every accessed Field inside the Process hole", () => {
    const stand = buildStateGraphProcessStand()
    expect(stand.processFields).toHaveLength(5)

    for (const field of stand.processFields) {
      const radialExtent = Math.hypot(
        field.x - stand.process.x,
        field.y - stand.process.y,
        field.z - stand.process.z,
      ) + field.radius
      expect(radialExtent).toBeLessThan(stand.process.form.innerRadius)
    }
  })

  test("draws ownership once and exact handler-to-Field relations", () => {
    const stand = buildStateGraphProcessStand()
    const expectedHandlerSegments = stand.handlers.reduce(
      (count, handler) => count + handler.fieldIds.length,
      0,
    )

    expect(stand.context.tori).toHaveLength(1)
    expect(stand.context.segments).toHaveLength(1 + expectedHandlerSegments)
    expect(stand.context.labels?.map((label) => label.text)).toEqual([
      "Process 12",
      "action",
      "success",
      "error",
    ])
  })
})
