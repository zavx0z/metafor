import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "../../protocol/force/message.ts"
import {formatImpulseLog} from "./log.ts"

const ENV_NAMES = ["METAFOR_LOG_IMPULSES", "METAFOR_LOG_DOMAINS", "METAFOR_LOG_PARTS"] as const
const previous = new Map<string, string | undefined>()

beforeEach(() => {
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
      parts: [{part: "gluon", op: "replace", path: 17, by: "matrix", ts: 1_700_000_000_000, from: "source", value: {3: 1}}],
    }

    expect(formatImpulseLog("matrix", "<-", message, {
      mode: "compact",
      now: new Date("2026-07-11T20:41:03.221Z"),
    })).toBe(
      "[2026-07-11T20:41:03.221Z] matrix <- gluon replace path=17 by=matrix ts=1700000000000 from=\"source\" value={\"3\":1}",
    )
  })

  test("redacts secrets in full JSON mode", () => {
    const message: ForceMessage = {
      parts: [{
        part: "w+",
        op: "replace",
        path: "atom/17",
        by: "energy",
        ts: 1_700_000_000_001,
        value: {result: 2, token: "must-not-be-logged", nested: {apiKey: "hidden"}},
      }],
    }

    const line = formatImpulseLog("energy", "->", message, {
      mode: "full",
      now: new Date("2026-07-11T20:41:03.221Z"),
    })

    expect(line).toStartWith("[2026-07-11T20:41:03.221Z] energy ->\n{\n  \"parts\": [")
    expect(line).toContain("[redacted]")
    expect(line).not.toContain("must-not-be-logged")
    expect(line).not.toContain("hidden")
  })

  test("does not truncate large messages in full mode", () => {
    const marker = "complete-tail-marker"
    const message: ForceMessage = {
      parts: [{part: "graviton", op: "replace", path: "runtime/test", by: "boundary", ts: 1_700_000_000_002, value: `${"x".repeat(5_000)}${marker}`}],
    }

    const line = formatImpulseLog("boundary", "->", message, {
      mode: "full",
      now: new Date("2026-07-11T20:41:03.221Z"),
    })

    expect(line).toContain(marker)
    expect(line).not.toEndWith("…")
    expect(line).not.toContain("#000")
  })

  test("applies domain and particle filters without changing the message", () => {
    Bun.env.METAFOR_LOG_DOMAINS = "matrix,energy"
    Bun.env.METAFOR_LOG_PARTS = "photon,w+"
    const message: ForceMessage = {
      parts: [{part: "gluon", op: "replace", path: 17, by: "matrix", ts: 1_700_000_000_003, value: {3: 1}}],
    }
    const before = structuredClone(message)

    expect(formatImpulseLog("matrix", "<-", message, {mode: "compact"})).toBeNull()
    expect(message).toEqual(before)
  })

  test("supports an explicit off mode", () => {
    const message: ForceMessage = {
      parts: [{part: "photon", op: "test", path: 17, by: "matrix", ts: 1_700_000_000_004, value: "ready"}],
    }

    expect(formatImpulseLog("matrix", "->", message, {mode: "off"})).toBeNull()
  })
})
