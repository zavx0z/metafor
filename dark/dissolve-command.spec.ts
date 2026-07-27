import {afterEach, describe, expect, test} from "bun:test"
import {chmodSync, mkdtempSync, readFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {MF117_COMMAND_SCHEMA} from "../shared/mf117.ts"
import {
  MF117OwnerCapability,
  readMF117Command,
} from "./dissolve-command.ts"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

describe("MF-117 exact owner command", () => {
  test("accepts only the private owner bearer and reuses it durably", () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-mf117-capability-"))
    directories.push(directory)
    const filename = join(directory, "owner-capability")
    const first = new MF117OwnerCapability(filename)
    const token = readFileSync(filename, "utf8").trim()
    const second = new MF117OwnerCapability(filename)

    expect(first.authorize(`Bearer ${token}`)).toBe(true)
    expect(second.authorize(`Bearer ${token}`)).toBe(true)
    expect(first.authorize("Bearer invalid")).toBe(false)
    expect(first.authorize(null)).toBe(false)
  })

  test("parses only the two closed exact actions", () => {
    expect(readMF117Command({
      schema: MF117_COMMAND_SCHEMA,
      action: "preflight",
    })).toEqual({
      schema: MF117_COMMAND_SCHEMA,
      action: "preflight",
    })
    expect(readMF117Command({
      schema: MF117_COMMAND_SCHEMA,
      action: "activate",
      preflightReceiptId: "a".repeat(64),
    })).toEqual({
      schema: MF117_COMMAND_SCHEMA,
      action: "activate",
      preflightReceiptId: "a".repeat(64),
    })
    expect(() => readMF117Command({
      schema: MF117_COMMAND_SCHEMA,
      action: "preflight",
      target: "other/root",
    })).toThrow("not closed")
    expect(() => readMF117Command({
      schema: MF117_COMMAND_SCHEMA,
      action: "activate",
      preflightReceiptId: "short",
    })).toThrow("invalid")
  })

  test("refuses a capability inside a group- or world-accessible directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-mf117-capability-"))
    directories.push(directory)
    chmodSync(directory, 0o755)

    expect(() =>
      new MF117OwnerCapability(join(directory, "owner-capability"))
    ).toThrow("directory is not private")
  })
})
