import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {spawnSync} from "node:child_process"
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

const cli = resolve(import.meta.dir, "../src/cli.ts")
const cliTestTimeout = 60_000
const generatedFiles = [
  "meta.ts",
  "src/metafor.d.ts",
  "package.json",
  "tsconfig.json",
  "TODO.md",
  ".gitignore",
  "index.html",
] as const

const runCli = (name: string, parent: string) =>
  spawnSync("bun", [cli, name, "--dir", parent, "--lang", "en"], {
    encoding: "utf8",
  })

const git = (repository: string, ...args: string[]): string => {
  const result = spawnSync("git", args, {cwd: repository, encoding: "utf8"})
  expect(result.status).toBe(0)
  return result.stdout.trim()
}

const hasLockfile = (repository: string): boolean =>
  existsSync(join(repository, "bun.lock")) ||
  existsSync(join(repository, "bun.lockb"))

describe("create-metafor CLI", () => {
  let temporaryRoot: string
  let ownerDirectory: string

  beforeEach(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "create-metafor-"))
    ownerDirectory = join(temporaryRoot, "zavx0z")
    mkdirSync(ownerDirectory)
  })

  afterEach(() => {
    rmSync(temporaryRoot, {recursive: true, force: true})
  })

  test("creates two full independent peers beneath an arbitrary owner parent", () => {
    expect(runCli("capsule", ownerDirectory).status).toBe(0)
    expect(runCli("capsule-profile", ownerDirectory).status).toBe(0)

    for (const repository of ["capsule", "capsule-profile"]) {
      const repositoryRoot = join(ownerDirectory, repository)
      for (const file of generatedFiles) {
        expect(existsSync(join(repositoryRoot, file))).toBe(true)
      }
      expect(hasLockfile(repositoryRoot)).toBe(true)
      expect(existsSync(join(repositoryRoot, ".git"))).toBe(true)
      expect(git(repositoryRoot, "rev-list", "--count", "HEAD")).toBe("1")
      expect(git(repositoryRoot, "log", "-1", "--pretty=%s")).toBe("Initial commit")
      expect(git(repositoryRoot, "status", "--porcelain")).toBe("")

      const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"))
      expect(packageJson.name).toBe(`@zavx0z/${repository}`)
      expect(packageJson.workspaces).toBeUndefined()
      expect(readFileSync(join(repositoryRoot, "index.html"), "utf8")).toContain(
        `src="zavx0z/${repository}"`,
      )
    }
    expect(existsSync(join(ownerDirectory, "capsule", "capsule-profile"))).toBe(false)
  }, cliTestTimeout)

  test("refuses to overwrite an existing peer target", () => {
    expect(runCli("capsule", ownerDirectory).status).toBe(0)

    const repeated = runCli("capsule", ownerDirectory)
    expect(repeated.status).toBe(1)
    expect(repeated.stderr).toContain("Meta repository already exists")
  }, cliTestTimeout)

  test("rejects nested creation inside an existing Meta repository", () => {
    expect(runCli("capsule", ownerDirectory).status).toBe(0)
    const repositoryRoot = join(ownerDirectory, "capsule")

    const nested = runCli("profile", repositoryRoot)
    expect(nested.status).toBe(1)
    expect(nested.stderr).toContain("inside an existing Meta repository")
    expect(existsSync(join(repositoryRoot, "profile"))).toBe(false)
  }, cliTestTimeout)

  test("rejects a third identity segment in the repository argument", () => {
    const result = runCli("capsule/profile", ownerDirectory)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("one lowercase segment without slashes")
    expect(existsSync(join(ownerDirectory, "capsule"))).toBe(false)
  })

  test("requires the supplied parent basename to be a valid owner segment", () => {
    const invalidOwner = join(temporaryRoot, "Owner Space")
    mkdirSync(invalidOwner)

    const result = runCli("capsule", invalidOwner)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("valid owner segment")
  })
})
