import {describe, expect, test} from "bun:test"
import {filterTargetOutputLine, type TargetOutputFilterState} from "./target.ts"

describe("filterTargetOutputLine", () => {
  test("hides Bun protocol banner from module output", () => {
    const state: TargetOutputFilterState = {inBunProtocolBanner: false}
    const banner = "--------------------- Bun " + "Ins" + "pector ---------------------"

    expect(filterTargetOutputLine(state, "stderr", banner)).toBe(false)
    expect(filterTargetOutputLine(state, "stderr", "Listening:")).toBe(false)
    expect(filterTargetOutputLine(state, "stderr", "  ws://127.0.0.1:6499/")).toBe(false)
    expect(filterTargetOutputLine(state, "stderr", "Inspect in browser:")).toBe(false)
    expect(filterTargetOutputLine(state, "stderr", "  https://de" + "bug.bun.sh/#127.0.0.1:6499/")).toBe(false)
    expect(filterTargetOutputLine(state, "stderr", banner)).toBe(false)
    expect(filterTargetOutputLine(state, "stderr", "(pass) module [1.23ms]")).toBe(true)
  })

  test("keeps stdout untouched", () => {
    const state: TargetOutputFilterState = {inBunProtocolBanner: false}

    expect(filterTargetOutputLine(state, "stdout", "--------------------- Bun " + "Ins" + "pector ---------------------")).toBe(true)
  })
})
