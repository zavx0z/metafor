import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, readFile, writeFile, rm, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {massFileName, MassCatalog} from "./mass.ts"

const a = "33333333-3333-4333-8333-333333333333"
const b = "44444444-4444-4444-8444-444444444444"

describe("shared flat Mass catalog", () => {
  const roots: string[] = []
  afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true}) })
  test("copies a large key only within its own worktree catalog", async () => {
    const left = await mkdtemp(join(tmpdir(), "mass-left-")); roots.push(left)
    const right = await mkdtemp(join(tmpdir(), "mass-right-")); roots.push(right)
    const catalog = new MassCatalog(left)
    await writeFile(join(left, massFileName(a, "binary")), Buffer.alloc(1024 * 1024, 7))
    await catalog.copy(a, b, "binary")
    expect((await readFile(join(left, massFileName(b, "binary")))).byteLength).toBe(1024 * 1024)
    await expect(readFile(join(right, massFileName(b, "binary")))).rejects.toThrow()
  })
  test("rejects symlink targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "mass-link-")); roots.push(root)
    await symlink(join(tmpdir(), "outside"), join(root, massFileName(a, "json")))
    await expect(new MassCatalog(root).copy(a, b, "json")).rejects.toThrow("symlink")
  })
  test("migrates one legacy key to its codec extension without overwriting", async () => {
    const root = await mkdtemp(join(tmpdir(), "mass-migrate-")); roots.push(root)
    const catalog = new MassCatalog(root)
    await writeFile(join(root, a), "legacy")
    expect(await catalog.migrateLegacy(a, "json")).toBe(true)
    expect(await readFile(join(root, massFileName(a, "json")), "utf8")).toBe("legacy")
    await expect(readFile(join(root, a))).rejects.toThrow()
    expect(await catalog.migrateLegacy(a, "json")).toBe(false)
  })
  test("refuses ambiguous legacy and extension-bearing files", async () => {
    const root = await mkdtemp(join(tmpdir(), "mass-conflict-")); roots.push(root)
    const catalog = new MassCatalog(root)
    await writeFile(join(root, a), "legacy")
    await writeFile(join(root, massFileName(a, "json")), "current")
    await expect(catalog.migrateLegacy(a, "json")).rejects.toThrow("both exist")
    expect(await readFile(join(root, a), "utf8")).toBe("legacy")
    expect(await readFile(join(root, massFileName(a, "json")), "utf8")).toBe("current")
  })
})
