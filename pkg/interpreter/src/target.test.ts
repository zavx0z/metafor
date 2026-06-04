import {describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {EventLogger} from "./logger.ts"
import {filterTargetOutputLine, TargetSupervisor, type TargetOutputFilterState} from "./target.ts"

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

describe("TargetSupervisor", () => {
  test("stop waits until the child process has exited", async () => {
    const dir = mkdtempSync(join(tmpdir(), "metafor-target-"))
    try {
      const target = new TargetSupervisor(new EventLogger(join(dir, "events.log")))
      target.start({
        command: ["bun", "-e", "setInterval(() => {}, 1000)"],
        cwd: dir,
      })

      const stopped = await target.stop()

      expect(stopped.state).toBe("exited")
      expect(stopped.exitedAt).not.toBeNull()
    } finally {
      rmSync(dir, {recursive: true, force: true})
    }
  })
})
