import {describe, expect, test} from "bun:test"
import {
  CenteredNested,
  OutsideIn,
  Visual,
  visualLayoutForSlug,
} from "../src/layout.ts"

describe("Visual layout catalog", () => {
  test("exposes complete-snapshot layouts instead of entity pages", () => {
    expect(Visual).toEqual([OutsideIn, CenteredNested])
    expect(Visual.map(({slug}) => slug)).toEqual([
      "outside-in",
      "centered-nested",
    ])
    expect(Visual.some((layout) => "entity" in layout)).toBe(false)
  })

  test("keeps outside-in explicit and ready", () => {
    expect(visualLayoutForSlug("outside-in")).toMatchObject({
      slug: "outside-in",
      label: "Снаружи → внутрь",
      status: "ready",
      description:
        "Полный Bulk scene snapshot от корневого Atom внутрь каждого рекурсивного Atom.",
    })
    expect(typeof visualLayoutForSlug("outside-in")?.buildScene)
      .toBe("function")
  })

  test("exposes centered nesting as a ready executable layout", () => {
    expect(visualLayoutForSlug("centered-nested")).toMatchObject({
      slug: "centered-nested",
      label: "Центрированно-вложенная",
      status: "ready",
      description:
        "Общий центр вложенных Torus: private Fields остаются в ядре владельца, а общие canonical Values — у верхнего общего предка.",
    })
    expect(typeof visualLayoutForSlug("centered-nested")?.buildScene)
      .toBe("function")
  })

  test("does not silently select an unfinished layout for an unknown slug", () => {
    expect(visualLayoutForSlug("missing-layout")).toBeUndefined()
  })
})
