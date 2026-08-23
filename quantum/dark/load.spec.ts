import {describe, expect, test} from "bun:test"
import {resolve} from "node:path"

import {canonicalMetaSource, evaluateMetaSource, resolveMetaPath} from "./load.ts"

describe("Dark Meta source addressing", () => {
  test("accepts exactly one owner and one peer repository segment", () => {
    expect(canonicalMetaSource("zavx0z/capsule")).toBe(true)
    expect(canonicalMetaSource("zavx0z/capsule-profile")).toBe(true)

    expect(canonicalMetaSource("capsule")).toBe(false)
    expect(canonicalMetaSource("zavx0z/capsule/profile")).toBe(false)
    expect(canonicalMetaSource("zavx0z/capsule/profile/nested")).toBe(false)
    expect(canonicalMetaSource("zavx0z/capsule/../profile")).toBe(false)
    expect(canonicalMetaSource("/zavx0z/capsule/profile")).toBe(false)
  })

  test("resolves src below the physical cluster root", () => {
    const root = resolve(import.meta.dir, "..", "cluster")

    expect(resolveMetaPath("zavx0z/capsule")).toBe(
      resolve(root, "zavx0z", "capsule", "meta.ts"),
    )
    expect(resolveMetaPath("zavx0z/capsule-profile")).toBe(
      resolve(root, "zavx0z", "capsule-profile", "meta.ts"),
    )
  })

  test("rejects noncanonical sources before filesystem access", () => {
    expect(() => resolveMetaPath("capsule")).toThrow(
      "Ожидается <owner>/<repository>",
    )
    expect(() => resolveMetaPath("zavx0z/capsule/profile")).toThrow(
      "Ожидается <owner>/<repository>",
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
