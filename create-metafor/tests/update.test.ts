import { describe, expect, test } from "bun:test"
import { getRestartCommand, getSelfUpdateCommand } from "../src/update"

describe("getSelfUpdateCommand", () => {
  test("uses bun for bun user agent", () => {
    const result = getSelfUpdateCommand("bun/1.2.0")
    expect(result.command).toBe("bun")
    expect(result.args.join(" ")).toContain("add -g create-metafor@latest")
  })

  test("uses pnpm for pnpm user agent", () => {
    const result = getSelfUpdateCommand("pnpm/9.0.0 npm/? node/v20")
    expect(result.command).toBe("pnpm")
  })

  test("falls back to npm and force update", () => {
    const result = getSelfUpdateCommand("npm/10.0.0")
    expect(result.command).toBe("npm")
    expect(result.args).toContain("--force")
  })
})

describe("getRestartCommand", () => {
  test("restarts current script with passed args", () => {
    const result = getRestartCommand(["node", "/tmp/dist/tui.js", "--foo"])
    expect(result.command).toBe(process.execPath)
    expect(result.args).toEqual(["/tmp/dist/tui.js", "--foo"])
  })

  test("returns only executable when argv has no script", () => {
    const result = getRestartCommand(["node"])
    expect(result.command).toBe(process.execPath)
    expect(result.args).toEqual([])
  })
})
