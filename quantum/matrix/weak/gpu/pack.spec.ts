import {describe, expect, test} from "bun:test"
import {FieldType} from "../../gravity/schema.ts"
import {createPackContext, encodeValue} from "./pack.ts"

describe("Matrix GPU value packing", () => {
  test("distinguishes an absent Array from a present empty Array", () => {
    const context = createPackContext({type: FieldType.ARRAY_PTR, elementType: "string"}, [""])
    expect(encodeValue(null, context)).toEqual({value1: 0, value2: 0})
    expect(encodeValue([], context)).toEqual({value1: 0, value2: 1})
  })
})
