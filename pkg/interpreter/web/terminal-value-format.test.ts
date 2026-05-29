import {expect, test} from "bun:test"
import {formatTerminalExpressionResult} from "./terminal-value-format.ts"

const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, "")

test("terminal expression formatter expands object properties", async () => {
  const formatted = await formatTerminalExpressionResult({
    result: {
      type: "object",
      className: "Object",
      description: "Object",
      objectId: "object-1",
    },
  }, async (objectId) => {
    expect(objectId).toBe("object-1")
    return {
      result: [
        {name: "name", enumerable: true, value: {type: "string", value: "MetaFor"}},
        {name: "count", enumerable: true, value: {type: "number", value: 3}},
        {name: "enabled", enumerable: true, value: {type: "boolean", value: true}},
      ],
    }
  })

  expect(stripAnsi(formatted)).toBe([
    "{",
    "  name: \"MetaFor\",",
    "  count: 3,",
    "  enabled: true",
    "}",
  ].join("\n"))
  expect(formatted).toContain("\x1b[36mname\x1b[0m")
  expect(formatted).toContain("\x1b[32m\"MetaFor\"\x1b[0m")
  expect(formatted).toContain("\x1b[33m3\x1b[0m")
})

test("terminal expression formatter falls back to object description when properties are unavailable", async () => {
  const formatted = await formatTerminalExpressionResult({
    result: {
      type: "object",
      description: "Object",
      objectId: "object-1",
    },
  }, async () => {
    throw new Error("not available")
  })

  expect(stripAnsi(formatted)).toBe("Object")
})

test("terminal expression formatter expands arrays as literals", async () => {
  const formatted = await formatTerminalExpressionResult({
    result: {
      type: "object",
      subtype: "array",
      description: "Array(2)",
      objectId: "array-1",
    },
  }, async () => ({
    result: [
      {name: "0", enumerable: true, value: {type: "string", value: "a"}},
      {name: "1", enumerable: true, value: {type: "string", value: "b"}},
      {name: "length", enumerable: false, value: {type: "number", value: 2}},
    ],
  }))

  expect(stripAnsi(formatted)).toBe([
    "[",
    "  \"a\",",
    "  \"b\"",
    "]",
  ].join("\n"))
})
