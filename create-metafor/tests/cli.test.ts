import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {spawnSync} from "node:child_process"
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

const cli = resolve(import.meta.dir, "../src/cli.ts")

describe("create-metafor CLI", () => {
  let temporaryRoot: string
  let galaxyRoot: string

  beforeEach(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "create-metafor-"))
    galaxyRoot = join(temporaryRoot, "cluster", "zavx0z")
    mkdirSync(galaxyRoot, {recursive: true})
  })

  afterEach(() => {
    rmSync(temporaryRoot, {recursive: true, force: true})
  })

  test("creates a root Atom repository directly inside a Galaxy owner", () => {
    const result = spawnSync("bun", [cli, "capsule", "--dir", galaxyRoot, "--lang", "en"], {
      encoding: "utf8",
    })
    const repositoryRoot = join(galaxyRoot, "capsule")

    expect(result.status).toBe(0)
    expect(existsSync(join(repositoryRoot, "meta.ts"))).toBe(true)
    expect(existsSync(join(repositoryRoot, ".git"))).toBe(true)

    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"))
    expect(packageJson.name).toBe("@zavx0z/capsule")
    expect(packageJson.workspaces).toEqual(["*"])
    expect(readFileSync(join(repositoryRoot, "index.html"), "utf8")).toContain(
      'src="zavx0z/capsule"',
    )
  })

  test("creates internal Atoms beside each other without nested Git", () => {
    expect(spawnSync("bun", [cli, "capsule", "--dir", galaxyRoot, "--lang", "en"]).status).toBe(0)
    const repositoryRoot = join(galaxyRoot, "capsule")

    const profile = spawnSync("bun", [cli, "profile", "--dir", repositoryRoot, "--lang", "en"])
    const leaf = spawnSync("bun", [cli, "leaf", "--dir", repositoryRoot, "--lang", "en"])

    expect(profile.status).toBe(0)
    expect(leaf.status).toBe(0)
    expect(existsSync(join(repositoryRoot, "profile", "meta.ts"))).toBe(true)
    expect(existsSync(join(repositoryRoot, "leaf", "meta.ts"))).toBe(true)
    expect(existsSync(join(repositoryRoot, "profile", ".git"))).toBe(false)
    expect(existsSync(join(repositoryRoot, "profile", "leaf"))).toBe(false)

    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "profile", "package.json"), "utf8"))
    expect(packageJson.name).toBe("@zavx0z/capsule-profile")
    expect(packageJson.workspaces).toBeUndefined()
    expect(readFileSync(join(repositoryRoot, "profile", "index.html"), "utf8")).toContain(
      'src="zavx0z/capsule/profile"',
    )
  })

  test("refuses to overwrite a root or internal Meta-package", () => {
    expect(spawnSync("bun", [cli, "capsule", "--dir", galaxyRoot, "--lang", "en"]).status).toBe(0)

    const repeatedRoot = spawnSync("bun", [cli, "capsule", "--dir", galaxyRoot, "--lang", "en"], {
      encoding: "utf8",
    })
    expect(repeatedRoot.status).toBe(1)
    expect(repeatedRoot.stderr).toContain("Meta-package already exists")

    const repositoryRoot = join(galaxyRoot, "capsule")
    expect(spawnSync("bun", [cli, "profile", "--dir", repositoryRoot, "--lang", "en"]).status).toBe(0)
    const repeatedInternal = spawnSync(
      "bun",
      [cli, "profile", "--dir", repositoryRoot, "--lang", "en"],
      {encoding: "utf8"},
    )
    expect(repeatedInternal.status).toBe(1)
    expect(repeatedInternal.stderr).toContain("Meta-package already exists")
  })

  test("requires a canonical Cluster location", () => {
    const outside = join(temporaryRoot, "zavx0z")
    mkdirSync(outside, {recursive: true})

    const result = spawnSync("bun", [cli, "capsule", "--dir", outside, "--lang", "en"], {
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("cluster/<owner>")
  })
})
