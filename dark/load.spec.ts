import {describe, expect, test} from "bun:test"
import {resolve} from "node:path"

import {canonicalMetaSource, resolveMetaPath} from "./load.ts"

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
    const root = resolve("/tmp", "metafor-cluster")

    expect(resolveMetaPath("zavx0z/capsule", root)).toBe(
      resolve(root, "zavx0z", "capsule", "meta.ts"),
    )
    expect(resolveMetaPath("zavx0z/capsule/profile", root)).toBe(
      resolve(root, "zavx0z", "capsule", "profile", "meta.ts"),
    )
  })

  test("rejects noncanonical sources before filesystem access", () => {
    expect(() => resolveMetaPath("capsule", "/tmp/cluster")).toThrow(
      "Ожидается <github-user>/<repository>[/<meta-package>]",
    )
  })
})
