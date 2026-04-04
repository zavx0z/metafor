import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import {
  isGitInstalled,
  getGitUserName,
  getGitUserEmail,
  initGitRepo,
  gitAddAll,
  gitCommit,
} from "../src/git.ts"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

describe("isGitInstalled", () => {
  test("должен определять установлен ли git", () => {
    const installed = isGitInstalled()
    expect(typeof installed).toBe("boolean")
  })
})

describe("getGitUserName", () => {
  test("должен возвращать имя или null", () => {
    const name = getGitUserName()
    expect(name === null || typeof name === "string").toBe(true)
  })
})

describe("getGitUserEmail", () => {
  test("должен возвращать email или null", () => {
    const email = getGitUserEmail()
    expect(email === null || typeof email === "string").toBe(true)
  })
})

describe("git functions", () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "git-test-"))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  test("должен инициализировать репозиторий", () => {
    if (!isGitInstalled()) return
    
    const result = initGitRepo(testDir)
    expect(result).toBe(true)
  })

  test("должен добавлять файлы", () => {
    if (!isGitInstalled()) return
    
    initGitRepo(testDir)
    writeFileSync(join(testDir, "test.txt"), "test")
    const result = gitAddAll(testDir)
    expect(result).toBe(true)
  })

  test("должен делать коммит", () => {
    if (!isGitInstalled()) return
    
    initGitRepo(testDir)
    writeFileSync(join(testDir, "test.txt"), "test")
    gitAddAll(testDir)
    const result = gitCommit(testDir, "Test commit")
    expect(result).toBe(true)
  })
})
