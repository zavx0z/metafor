import {describe, expect, test} from "bun:test"
import {
  CenteredNested,
  OutsideIn,
  Visual,
  visualLayoutForSlug,
} from "./index.ts"

describe("Visual layout catalog", () => {
  test("exposes complete-snapshot layouts instead of entity pages", () => {
    expect(Visual).toEqual([OutsideIn, CenteredNested])
    expect(Visual.map(({slug}) => slug)).toEqual([
      "outside-in",
      "centered-nested",
    ])
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

  test("adds centered nesting as an independent snapshot layout", () => {
    expect(visualLayoutForSlug("centered-nested")).toEqual({
      slug: "centered-nested",
      label: "Центрированно-вложенная",
      status: "in-progress",
      description:
        "Общий центр вложенных Torus: частные Fields остаются в ядре, а общие canonical Values занимают последовательные Matter-орбиты.",
    })
  })
})
