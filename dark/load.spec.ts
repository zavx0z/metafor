import {describe, expect, test} from "bun:test"
import {resolve} from "node:path"

import {canonicalMetaSource, metaImportSpecifier, resolveMetaPath} from "./load.ts"

describe("Dark Meta source addressing", () => {
  test("accepts a root Atom or one internal Meta-package segment", () => {
    expect(canonicalMetaSource("zavx0z/capsule")).toBe(true)
    expect(canonicalMetaSource("zavx0z/capsule/profile")).toBe(true)

    expect(canonicalMetaSource("capsule")).toBe(false)
    expect(canonicalMetaSource("zavx0z/capsule/profile/nested")).toBe(false)
    expect(canonicalMetaSource("zavx0z/capsule/../profile")).toBe(false)
    expect(canonicalMetaSource("/zavx0z/capsule/profile")).toBe(false)
  })

  test("resolves src below the physical cluster root", () => {
    const root = resolve(import.meta.dir, "..", "cluster")

    expect(resolveMetaPath("zavx0z/capsule")).toBe(
      resolve(root, "zavx0z", "capsule", "meta.ts"),
    )
    expect(resolveMetaPath("zavx0z/capsule/profile")).toBe(
      resolve(root, "zavx0z", "capsule", "profile", "meta.ts"),
    )
  })

  test("rejects noncanonical sources before filesystem access", () => {
    expect(() => resolveMetaPath("capsule")).toThrow(
      "Ожидается <github-user>/<repository>[/<meta-package>]",
    )
  })

  test("gives every test read a fresh ESM module identity", () => {
    const first = metaImportSpecifier("zavx0z/capsule", "read-1")
    const second = metaImportSpecifier("zavx0z/capsule", "read-2")

    expect(first).not.toBe(second)
    expect(first).toContain("/cluster/zavx0z/capsule/meta.ts?metafor-read=read-1")
    expect(second).toContain("/cluster/zavx0z/capsule/meta.ts?metafor-read=read-2")
  })
})
