import {describe, expect, test} from "bun:test"
import {applyInspectMode} from "./inspect-mode.ts"

describe("applyInspectMode", () => {
  test("switches inspect-wait to inspect-brk", () => {
    expect(applyInspectMode(["bun", "test", "--inspect-wait=ws://127.0.0.1:6499/", "dark/server.spec.ts"], "brk", "ws://x")).toEqual([
      "bun",
      "test",
      "--inspect-brk=ws://127.0.0.1:6499/",
      "dark/server.spec.ts",
    ])
  })

  test("switches inspect-brk back to inspect-wait", () => {
    expect(applyInspectMode(["bun", "test", "--inspect-brk=ws://127.0.0.1:6499/"], "wait", "ws://x")).toEqual([
      "bun",
      "test",
      "--inspect-wait=ws://127.0.0.1:6499/",
    ])
  })

  test("inserts inspect-brk for bun commands without an inspector flag", () => {
    expect(applyInspectMode(["bun", "test", "dark/server.spec.ts"], "brk", "ws://127.0.0.1:6499/")).toEqual([
      "bun",
      "--inspect-brk=ws://127.0.0.1:6499/",
      "test",
      "dark/server.spec.ts",
    ])
  })

  test("inserts inspect-wait for bun commands without an inspector flag", () => {
    expect(applyInspectMode(["bun", "test", "dark/server.spec.ts"], "wait", "ws://127.0.0.1:6499/")).toEqual([
      "bun",
      "--inspect-wait=ws://127.0.0.1:6499/",
      "test",
      "dark/server.spec.ts",
    ])
  })

  test("preserves explicit inspect mode while setting the endpoint", () => {
    expect(applyInspectMode(["bun", "--inspect", "module.ts"], "inspect", "ws://127.0.0.1:6499/")).toEqual([
      "bun",
      "--inspect=ws://127.0.0.1:6499/",
      "module.ts",
    ])
  })
})
