import {describe, expect, test} from "bun:test"
import {MetaFor} from "./metafor.ts"

describe("MetaFor Energy declaration", () => {
  test("keeps Energy as a type-only declaration separate from mutable Mass", () => {
    const schema = MetaFor("energy-declaration")
      .fields(() => ({}))
      .superposition({})
      .mass((mass) => ({attempts: mass.json({label: "Attempts"})}))
      .energy<{socket: WebSocket}>()
      .processes(() => [])
      .reactions(() => [])
      .matter()
      .bulk()

    expect(schema.mass).toEqual([{
      key: "attempts", format: "json", label: "Attempts",
    }])
    expect("energy" in schema).toBe(false)
  })

  test("rejects a self-transition even when an untyped caller bypasses the DSL type", () => {
    const builder = MetaFor("runtime-self-transition")
      .fields((field) => ({requested: field.boolean.required(false)}))

    expect(() => (builder.superposition as any)({
      ready: {ready: {requested: {eq: true}}},
    })).toThrow('запрещён самопереход состояния "ready"')
  })

  test("creates no runtime Energy value for an empty declaration", () => {
    const builder = MetaFor("invalid-energy-runtime")
      .fields(() => ({}))
      .superposition({})
      .mass(() => ({}))
      .energy()

    expect(builder).toHaveProperty("processes")
  })

  test("declares every Field as readable when the external action receives the whole value", () => {
    const schema = MetaFor("full-action-value")
      .fields((field) => ({
        command: field.string.optional(),
        attempts: field.number.required(0),
      }))
      .superposition({ready: null})
      .mass(() => ({}))
      .energy()
      .processes((process) => [
        process("ready").action(async ({field, value}) => {
          const probe = await import("./tests/types/fixtures/probe.ts")
          return probe.default({field, value})
        }),
      ])
      .reactions(() => [])
      .matter()
      .bulk()

    expect((schema.processes?.[0]?.declaration as {action: {read: string[]}}).action.read)
      .toEqual(["command", "attempts"])
  })
})
