import {describe, expect, test} from "bun:test"
import {FieldType} from "../../gravity/schema.ts"
import {createPackContext, encodeValue} from "./pack.ts"

describe("Matrix GPU value packing", () => {
  test("keeps the optional Array zero sentinel without allocating a heap value", () => {
    const context = createPackContext({type: FieldType.ARRAY_PTR, elementType: "string"}, [""])
    expect(encodeValue(0, context)).toEqual({value1: 0, value2: 0})
  })
})
