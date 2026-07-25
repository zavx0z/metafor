import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, readFile, writeFile, rm, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {MassCatalog} from "./mass.ts"

const a = "33333333-3333-4333-8333-333333333333"
const b = "44444444-4444-4444-8444-444444444444"

describe("shared flat Mass catalog", () => {
  const roots: string[] = []
  afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true}) })
  test("copies a large key only within its own worktree catalog", async () => {
    const left = await mkdtemp(join(tmpdir(), "mass-left-")); roots.push(left)
    const right = await mkdtemp(join(tmpdir(), "mass-right-")); roots.push(right)
    const catalog = new MassCatalog(left)
    await writeFile(join(left, a), Buffer.alloc(1024 * 1024, 7))
    await catalog.copy(a, b)
    expect((await readFile(join(left, b))).byteLength).toBe(1024 * 1024)
    await expect(readFile(join(right, b))).rejects.toThrow()
  })
  test("rejects symlink targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "mass-link-")); roots.push(root)
    await symlink(join(tmpdir(), "outside"), join(root, a))
    await expect(new MassCatalog(root).copy(a, b)).rejects.toThrow("symlink")
  })
})
