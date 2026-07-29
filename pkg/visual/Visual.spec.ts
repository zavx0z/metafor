import {describe, expect, test} from "bun:test"
import {OutsideIn, Visual, visualLayoutForSlug} from "./index.ts"

describe("Visual layout catalog", () => {
  test("exposes complete-snapshot layouts instead of entity pages", () => {
    expect(Visual).toEqual([OutsideIn])
    expect(Visual.map(({slug}) => slug)).toEqual(["outside-in"])
    expect(Visual.some((layout) => "entity" in layout)).toBe(false)
  })

  test("keeps outside-in explicit and marked as unfinished", () => {
    expect(visualLayoutForSlug("outside-in")).toEqual({
      slug: "outside-in",
      label: "Снаружи → внутрь",
      status: "in-progress",
      description:
        "Раскладка в работе: полный Monad snapshot от корневого Atom внутрь каждого рекурсивного Atom.",
    })
  })
})
