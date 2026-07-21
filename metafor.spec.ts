import {describe, expect, test} from "bun:test"
import {MetaFor} from "./metafor.ts"

describe("MetaFor Energy declaration", () => {
  test("keeps Energy as a type-only declaration separate from mutable Mass", () => {
    let declarationsExecuted = 0
    const schema = MetaFor("energy-declaration")
      .fields(() => ({}))
      .superposition({})
      .mass({attempts: 0})
      .energy(() => {
        declarationsExecuted += 1
        return {socket: null as unknown as WebSocket}
      })
      .processes(() => [])
      .reactions(() => [])
      .matter()
      .bulk()

    expect(schema.mass).toEqual({attempts: 0})
    expect(declarationsExecuted).toBe(0)
    expect("energy" in schema).toBe(false)
  })

  test("rejects a self-transition even when an untyped caller bypasses the DSL type", () => {
    const builder = MetaFor("runtime-self-transition")
      .fields((field) => ({requested: field.boolean.required(false)}))

    expect(() => (builder.superposition as any)({
      ready: {ready: {requested: {eq: true}}},
    })).toThrow('запрещён самопереход состояния "ready"')
  })

  test("does not execute an untyped Energy callback either", () => {
    let executed = false
    const builder = MetaFor("invalid-energy-runtime")
      .fields(() => ({}))
      .superposition({})
      .mass({})
      .energy((() => {
        executed = true
        throw new Error("Energy declaration executed")
      }) as any)

    expect(executed).toBe(false)
    expect(builder).toHaveProperty("processes")
  })

  test("declares every Field as readable when the external action receives the whole value", () => {
    const schema = MetaFor("full-action-value")
      .fields((field) => ({
        command: field.string.optional(),
        attempts: field.number.required(0),
      }))
      .superposition({ready: null})
      .mass({})
      .energy(() => ({}))
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
