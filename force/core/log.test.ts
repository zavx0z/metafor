import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"
import {formatImpulseLog, resetImpulseLogSequenceForTests} from "./log"

const ENV_NAMES = ["METAFOR_LOG_IMPULSES", "METAFOR_LOG_DOMAINS", "METAFOR_LOG_PARTS"] as const
const previous = new Map<string, string | undefined>()

beforeEach(() => {
  resetImpulseLogSequenceForTests()
  for (const name of ENV_NAMES) {
    previous.set(name, Bun.env[name])
    delete Bun.env[name]
  }
})

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = previous.get(name)
    if (value === undefined) delete Bun.env[name]
    else Bun.env[name] = value
  }
  previous.clear()
})

describe("Force impulse logger", () => {
  test("formats one minimal particle as a compact ordered server line", () => {
    const message: ForceMessage = {
      parts: [{part: "gluon", op: "replace", path: 17, from: "source", value: {3: 1}}],
    }

    expect(formatImpulseLog("matrix", "<-", message, {
      mode: "compact",
      now: new Date("2026-07-11T20:41:03.221Z"),
      sequence: 42,
    })).toBe(
      "[2026-07-11T20:41:03.221Z] #000042 matrix <- gluon replace path=17 from=\"source\" value={\"3\":1}",
    )
  })

  test("redacts secrets in full JSON mode", () => {
    const message: ForceMessage = {
      parts: [{
        part: "w+",
        op: "replace",
        path: "actor/17",
        value: {result: 2, token: "must-not-be-logged", nested: {apiKey: "hidden"}},
      }],
    }

    const line = formatImpulseLog("energy", "->", message, {
      mode: "full",
      now: new Date("2026-07-11T20:41:03.221Z"),
      sequence: 1,
    })

    expect(line).toContain("[redacted]")
    expect(line).not.toContain("must-not-be-logged")
    expect(line).not.toContain("hidden")
  })

  test("applies domain and particle filters without changing the message", () => {
    Bun.env.METAFOR_LOG_DOMAINS = "matrix,energy"
    Bun.env.METAFOR_LOG_PARTS = "photon,w+"
    const message: ForceMessage = {
      parts: [{part: "gluon", op: "replace", path: 17, value: {3: 1}}],
    }
    const before = structuredClone(message)

    expect(formatImpulseLog("matrix", "<-", message, {mode: "compact"})).toBeNull()
    expect(message).toEqual(before)
  })

  test("supports an explicit off mode", () => {
    const message: ForceMessage = {
      parts: [{part: "photon", op: "test", path: 17, value: "ready"}],
    }

    expect(formatImpulseLog("matrix", "->", message, {mode: "off"})).toBeNull()
  })
})
