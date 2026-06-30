import { describe, expect, test } from "bun:test"
import { materializeEntanglement } from "../strong/entangled"

describe("materializeEntanglement — prepared projection only", () => {
  test("does not derive entanglement without prepared projection", () => {
    const values: [number, unknown][][] = [
      [[0, 100]],
      [[0, 100]],
    ]

    const mapping = materializeEntanglement(values)

    expect(mapping.entangledFields.size).toBe(0)
    expect(mapping.braneEntangledMap).toEqual([[], []])
    expect(mapping.localFields).toEqual([
      [[0, 100]],
      [[0, 100]],
    ])
  })

  test("materializes shared values only from prepared blocks", () => {
    const values: [number, unknown][][] = [
      [[0, 100], [1, 10]],
      [[0, 100], [1, 20]],
    ]

    const mapping = materializeEntanglement(values, {
      blocks: [
        {
          key: "0,1",
          braneIndices: [0, 1],
          fields: [
            {
              fieldIndex: 0,
              fieldName: "hp",
              payloadIds: ["payload:hp"],
              semanticKeys: ["fields:/fields/hp:"],
              representativeBraneIndex: 0,
            },
          ],
        },
      ],
    })

    expect(mapping.entangledFields.get("0,1")).toEqual([[0, 100]])
    expect(mapping.braneEntangledMap).toEqual([[0], [0]])
    expect(mapping.localFields).toEqual([
      [[1, 10]],
      [[1, 20]],
    ])
  })

  test("throws on duplicate prepared field assignment across blocks", () => {
    const values: [number, unknown][][] = [
      [[0, 100], [1, 10]],
      [[0, 100], [1, 20]],
    ]

    expect(() =>
      materializeEntanglement(values, {
        blocks: [
          {
            key: "first",
            braneIndices: [0, 1],
            fields: [
              {
                fieldIndex: 0,
                fieldName: "hp",
                payloadIds: ["payload:hp:first"],
                semanticKeys: ["fields:/fields/hp:first"],
              },
            ],
          },
          {
            key: "second",
            braneIndices: [0, 1],
            fields: [
              {
                fieldIndex: 0,
                fieldName: "hp",
                payloadIds: ["payload:hp:second"],
                semanticKeys: ["fields:/fields/hp:second"],
              },
            ],
          },
        ],
      }),
    ).toThrow("already assigned")
  })
})
