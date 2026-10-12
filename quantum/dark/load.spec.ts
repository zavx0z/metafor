import {describe, expect, test} from "bun:test"
import {join, resolve} from "node:path"
import {mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {createMetaSourceResolver} from "shared/metafor/source"

import {canonicalMetaSource, evaluateMetaSource, loadMeta, resolveMetaAuthoringPath, resolveMetaPath} from "./load.ts"

describe("Dark Meta source addressing", () => {
  test("accepts exact scoped or unscoped package names", () => {
    expect(canonicalMetaSource("@zavx0z/capsule")).toBe(true)
    expect(canonicalMetaSource("@zavx0z/capsule-profile")).toBe(true)

    expect(canonicalMetaSource("capsule")).toBe(true)
    expect(canonicalMetaSource("zavx0z/capsule/profile")).toBe(false)
    expect(canonicalMetaSource("zavx0z/capsule/profile/nested")).toBe(false)
    expect(canonicalMetaSource("zavx0z/capsule/../profile")).toBe(false)
    expect(canonicalMetaSource("/zavx0z/capsule/profile")).toBe(false)
  })

  test("resolves canonical src through an explicitly supplied installed root", () => {
    const root = resolve(import.meta.dir, "fixtures", "installed")
    const resolver = createMetaSourceResolver({root, installed: true})
    expect(resolveMetaPath("@zavx0z/capsule", resolver)).toBe(resolve(root, "@zavx0z/capsule/meta.ts"))
  })

  test("loads installed entry and its compiled relative chunks with no source checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "metafor-installed-meta-"))
    try {
      await writeFile(join(root, "chunk.js"), "export const name = 'cached-release'\n")
      await writeFile(join(root, "server.js"), "import {name} from './chunk.js'; export default {name}\n")
      const resolver = createMetaSourceResolver({root, artifacts: {"owner/repository": {directory: ".", entry: "server.js"}}})
      expect((await loadMeta("owner/repository", resolver)).name).toBe("cached-release")
    } finally { await rm(root, {recursive: true, force: true}) }
  })

  test("rejects installed artifact paths as authoring targets", () => {
    const resolver = createMetaSourceResolver({root: "/tmp/installed", installed: true})
    expect(() => resolveMetaAuthoringPath("@zavx0z/capsule", resolver)).toThrow("source preparation root")
  })

  test("rejects noncanonical sources before filesystem access", () => {
    expect(() => resolveMetaPath("../capsule")).toThrow(
      "Ожидается имя package.json#name",
    )
    expect(() => resolveMetaPath("zavx0z/capsule/profile")).toThrow(
      "Ожидается имя package.json#name",
    )
  })

  test("evaluates identical source bytes as a fresh module on every read", async () => {
    const key = "__metaforFreshDeclarationRead"
    const global = globalThis as typeof globalThis & {[key: string]: number | undefined}
    const source = `
      globalThis.${key} = (globalThis.${key} ?? 0) + 1
      export default {name: String(globalThis.${key})}
    `
    try {
      expect((await evaluateMetaSource(source)).name).toBe("1")
      expect((await evaluateMetaSource(source)).name).toBe("2")
    } finally {
      delete global[key]
    }
  })

  test("provides the global MetaFor DSL to a Cluster source without an import", async () => {
    const declaration = await evaluateMetaSource(`
      export default MetaFor("cluster-global")
        .fields(() => ({}))
        .superposition({})
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter()
        .bulk()
    `)

    expect(declaration.name).toBe("cluster-global")
  })
})
