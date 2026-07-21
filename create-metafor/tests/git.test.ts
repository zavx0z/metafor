import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  getGitUserEmail,
  getGitUserName,
  gitAddAll,
  gitCommit,
  initGitRepo,
  isGitInstalled,
} from "../src/git.ts"

describe("Git support", () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "create-metafor-git-"))
  })

  afterEach(() => {
    rmSync(testDir, {recursive: true, force: true})
  })

  test("detects Git and optional user identity", () => {
    expect(typeof isGitInstalled()).toBe("boolean")
    expect(getGitUserName() === null || typeof getGitUserName() === "string").toBe(true)
    expect(getGitUserEmail() === null || typeof getGitUserEmail() === "string").toBe(true)
  })

  test("initializes and commits only the requested root repository", () => {
    if (!isGitInstalled()) return

    expect(initGitRepo(testDir)).toBe(true)
    writeFileSync(join(testDir, "meta.ts"), "export default {}\n")
    expect(gitAddAll(testDir)).toBe(true)
    expect(gitCommit(testDir, "Initial commit")).toBe(true)
  })
})
