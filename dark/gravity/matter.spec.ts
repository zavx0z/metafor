import {describe, expect, test} from "bun:test"
import {loadMeta} from "../load.ts"

describe("matter DSL", () => {
  test("dynamic-meta Fuzzy приходит из DSL с enum predicate binding", async () => {
    const relations = (await loadMeta("zavx0z/git")).matter ?? []
    const fuzzy = relations.find((particle) => particle.kind === "fuzzy" && particle.fuzzyKind === "dynamic-meta")

    expect(fuzzy).toBeDefined()
    expect(fuzzy && "predicateBinding" in fuzzy ? fuzzy.predicateBinding : undefined).toEqual({
      data: "operation",
      expr: "zavx0z/git-${_[0]}",
    })
  })
})
