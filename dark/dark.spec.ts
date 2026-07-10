import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {createForceTestFixture, type ForceTestFixture} from "force/fixture"
import type {ForceMessage} from "@metafor/types/force/message"

const src = "zavx0z/git"
const section = <T>(message: ForceMessage, path: string, name: string): T => {
  const part = message.parts.find((candidate) => {
    if (candidate.path !== path || typeof candidate.value !== "object" || candidate.value === null) return false
    return name in candidate.value
  })
  if (!part) throw new Error(`Missing ${name} declaration for ${path}`)
  return (part.value as Record<string, unknown>)[name] as T
}

describe("Dark inflaton declaration stream", () => {
  let fixture: ForceTestFixture
  let message: ForceMessage

  beforeAll(async () => {
    fixture = createForceTestFixture()
    await import("./dark.ts")
    const dark = await fixture.waitForClient("dark", 5_000)
    fixture.impulse(dark, {
      parts: [{part: "inflaton", op: "test", path: src, value: null}],
    })
    message = (await fixture.waitForMessage(
      ({domain, message}) => domain === "dark" && message.parts.some((part) =>
        part.path === src &&
        typeof part.value === "object" &&
        part.value !== null &&
        "meta" in part.value
      ),
      0,
      30_000,
    )).message
  })

  afterAll(() => fixture.close())

  test("emits only inflaton/replace with meta SRC as path", () => {
    expect(message.parts.length).toBeGreaterThan(11)
    expect(message.parts.every((part) =>
      part.part === "inflaton" && part.op === "replace" && typeof part.path === "string"
    )).toBe(true)
    expect(message.parts.some((part) => part.part === "graviton")).toBe(false)
    expect(message.parts.slice(0, 11).every((part) => part.path === src)).toBe(true)
  })

  test("emits deterministic field IDs and separate enum variants", () => {
    const fields = section<Record<string, Record<string, unknown>>>(message, src, "fields")
    const variants = section<Record<string, Record<string, unknown>>>(message, src, "variants")

    expect(fields["1"]).toEqual({key: "operation", type: "enum", label: "Тип операции"})
    expect(fields["2"]?.key).toBe("error")
    expect(fields["3"]?.key).toBe("command")
    expect(fields["4"]?.key).toBe("args")
    expect(variants["1"]).toEqual({field: "1", position: 0, value: "start"})
    expect(variants["10"]).toEqual({field: "1", position: 9, value: "plumbing"})
  })

  test("normalizes states, transitions and conditions with local references", () => {
    const states = section<Record<string, Record<string, unknown>>>(message, src, "states")
    const transitions = section<Record<string, Record<string, unknown>>>(message, src, "transitions")
    const conditions = section<Record<string, Record<string, unknown>>>(message, src, "conditions")

    expect(states["1"]).toEqual({name: "получение команды", position: 0})
    expect(transitions["1"]).toEqual({from: "1", to: "2", position: 0})
    expect(conditions["1"]).toEqual({
      transition: "1",
      field: "3",
      position: 0,
      predicate: {null: false},
    })
  })

  test("preserves process action/env/read/write/handlers and finally", () => {
    const processes = section<Record<string, Record<string, any>>>(message, src, "processes")
    expect(processes["1"]?.key).toBe("определение операции")
    expect(processes["1"]?.env).toEqual(["any"])
    expect(processes["1"]?.action.read).toEqual(["3"])
    expect(processes["1"]?.success.write).toEqual(["4", "1"])
    expect(processes["1"]?.error.write).toEqual(["2"])

    const commitProcesses = section<Record<string, Record<string, any>>>(
      message,
      "zavx0z/git-history-commit",
      "processes",
    )
    const finalProcess = Object.values(commitProcesses).find((process) => process.type === "finally")
    expect(finalProcess).toEqual({
      key: "выполнено",
      type: "finally",
      env: [],
      before: {src: "() => {}", read: []},
    })
  })

  test("flattens matter with deterministic IDs and recursively includes child declarations", () => {
    const matter = section<Record<string, Record<string, unknown>>>(message, src, "matter")
    expect(matter["1"]?.kind).toBe("fuzzy")
    expect(matter["1"]?.parent).toBeNull()
    expect(matter["1"]?.edgeSlot).toBe("root")
    expect(matter["2"]?.kind).toBe("wimp")
    expect(matter["2"]?.parent).toBe("1")
    expect(matter["2"]?.edgeSlot).toBe("branch")
    expect(Object.keys(matter)).toEqual(Object.keys(matter).map((_, index) => String(index + 1)))

    const paths = new Set(message.parts.map((part) => part.path))
    expect(paths.has("zavx0z/git-start")).toBe(true)
    expect(paths.has("zavx0z/git-error")).toBe(true)
    expect(paths.has("zavx0z/git-history-commit")).toBe(true)
  })

  test("emits explicit empty and optional section replacements", () => {
    expect(section<Record<string, unknown>>(message, src, "reactions")).toEqual({})
    expect(section<Record<string, unknown>>(message, src, "mass")).toEqual({})
    expect(section<unknown>(message, src, "bulk")).toBeNull()
  })

  test("repeated test produces exactly the same declaration IDs and stream", async () => {
    const dark = await fixture.waitForClient("dark")
    const fromIndex = fixture.messages.length
    fixture.impulse(dark, {
      parts: [{part: "inflaton", op: "test", path: src, value: null}],
    })
    const repeated = (await fixture.waitForMessage(
      ({domain, message: candidate}) => domain === "dark" && candidate.parts[0]?.path === src,
      fromIndex,
      30_000,
    )).message
    expect(repeated).toEqual(message)
  })

  test("emits represented bulk declaration and its child catalog", async () => {
    const dark = await fixture.waitForClient("dark")
    const fromIndex = fixture.messages.length
    fixture.impulse(dark, {
      parts: [{part: "inflaton", op: "test", path: "zavx0z/linux", value: null}],
    })
    const linux = (await fixture.waitForMessage(
      ({domain, message: candidate}) => domain === "dark" && candidate.parts[0]?.path === "zavx0z/linux",
      fromIndex,
      10_000,
    )).message

    expect(section<{view: string}>(linux, "zavx0z/linux", "bulk")).toEqual({view: ""})
    expect(linux.parts.some((part) => part.path === "zavx0z/codex")).toBe(true)
  })
})
