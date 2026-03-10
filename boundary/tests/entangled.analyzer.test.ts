import { describe, expect, test } from "bun:test"
import { materializeEntanglement } from "../fields/entangled"

describe("materializeEntanglement — strict projection validation", () => {
  test("throws when a block has fewer than 2 branes", () => {
    const values: [number, unknown][][] = [
      [[0, 100]],
    ]

    expect(() =>
      materializeEntanglement(values, {
        blocks: [
          {
            braneIndices: [0],
            fields: [
              {
                fieldIndex: 0,
                fieldName: "hp",
                payloadIds: ["payload:hp"],
                semanticKeys: ["fields:/fields/hp:"],
              },
            ],
          },
        ],
      }),
    ).toThrow("requires at least 2 branes")
  })

  test("throws when a prepared field is missing in one of block branes", () => {
    const values: [number, unknown][][] = [
      [[0, 100]],
      [[1, 100]],
    ]

    expect(() =>
      materializeEntanglement(values, {
        blocks: [
          {
            braneIndices: [0, 1],
            fields: [
              {
                fieldIndex: 0,
                fieldName: "hp",
                payloadIds: ["payload:hp"],
                semanticKeys: ["fields:/fields/hp:"],
              },
            ],
          },
        ],
      }),
    ).toThrow("field 0 missing in brane 1")
  })

  test("throws when brane index is out of range", () => {
    const values: [number, unknown][][] = [
      [[0, 100]],
      [[0, 100]],
    ]

    expect(() =>
      materializeEntanglement(values, {
        blocks: [
          {
            braneIndices: [0, 2],
            fields: [
              {
                fieldIndex: 0,
                fieldName: "hp",
                payloadIds: ["payload:hp"],
                semanticKeys: ["fields:/fields/hp:"],
              },
            ],
          },
        ],
      }),
    ).toThrow("out of range")
  })
})
