import {describe, expect, test} from "bun:test"
import {applyInspectMode} from "./inspect-mode.ts"

describe("applyInspectMode", () => {
  test("switches inspect-wait to inspect-brk", () => {
    expect(applyInspectMode(["bun", "test", "--inspect-wait=ws://127.0.0.1:6499/dark", "dark/server.spec.ts"], "brk", "ws://x")).toEqual([
      "bun",
      "test",
      "--inspect-brk=ws://127.0.0.1:6499/dark",
      "dark/server.spec.ts",
    ])
  })

  test("switches inspect-brk back to inspect-wait", () => {
    expect(applyInspectMode(["bun", "test", "--inspect-brk=ws://127.0.0.1:6499/dark"], "wait", "ws://x")).toEqual([
      "bun",
      "test",
      "--inspect-wait=ws://127.0.0.1:6499/dark",
    ])
  })

  test("inserts inspect-brk for bun commands without an inspector flag", () => {
    expect(applyInspectMode(["bun", "test", "dark/server.spec.ts"], "brk", "ws://127.0.0.1:6499/dark")).toEqual([
      "bun",
      "--inspect-brk=ws://127.0.0.1:6499/dark",
      "test",
      "dark/server.spec.ts",
    ])
  })
})
