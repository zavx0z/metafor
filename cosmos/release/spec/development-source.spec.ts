import {afterEach, expect, test} from "bun:test"
import {mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {createDevelopmentSources} from "../server/development-source"

const roots: string[] = []
afterEach(async () => {await Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true})))})

test("редактор сохраняет свои исходники с hash и не затирает конкурирующую запись", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cosmos-source-")))
  roots.push(root)
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src/main.ts"), "export const value = 1\n")
  const sources = createDevelopmentSources({source(name) {
    if (name !== "example") throw new Error("Unassigned package")
    return {directory: root, name, label: name, address: "/cosmos/package/example", owner: name, resolution: "source", writable: true}
  }})
  expect(await sources.list("example")).toEqual({entries: [{path: "src", type: "directory"}], truncated: false})
  const initial = await sources.read("example", "src/main.ts")
  const saved = await sources.save("example", initial.path, "export const value = 2\n", initial.hash)
  expect(saved.hash).not.toBe(initial.hash)
  expect(await readFile(join(root, initial.path), "utf8")).toBe("export const value = 2\n")
  await expect(sources.save("example", initial.path, "stale", initial.hash)).rejects.toMatchObject({code: "CONFLICT"})
  expect(await readFile(join(root, initial.path), "utf8")).toBe("export const value = 2\n")
  await expect(sources.read("foreign", "src/main.ts")).rejects.toThrow("Unassigned package")
  await expect(sources.read("example", "../outside")).rejects.toMatchObject({code: "PATH_NOT_ALLOWED"})
})

test("редактор соблюдает read-only, не проходит symlink и не декодирует binary как исходник", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cosmos-source-")))
  roots.push(root)
  await writeFile(join(root, "main.ts"), "original")
  await writeFile(join(root, "binary"), Buffer.from([0xff, 0x00]))
  await symlink(join(root, "main.ts"), join(root, "alias.ts"))
  const sources = createDevelopmentSources({source(name) {
    return {directory: root, name, label: name, address: "/cosmos/package/example", owner: name, resolution: "source", writable: false}
  }})
  const original = await sources.read("example", "main.ts")
  expect(original.writable).toBe(false)
  await expect(sources.save("example", "main.ts", "changed", original.hash)).rejects.toMatchObject({code: "PATH_NOT_ALLOWED"})
  await expect(sources.read("example", "alias.ts")).rejects.toMatchObject({code: "PATH_NOT_ALLOWED"})
  await expect(sources.read("example", "binary")).rejects.toMatchObject({code: "INVALID_PATH_TYPE"})
  expect(await readFile(join(root, "main.ts"), "utf8")).toBe("original")
})
