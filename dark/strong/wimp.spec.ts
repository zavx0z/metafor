import { describe, expect, test } from "bun:test"
import { Wimp } from "@dark/strong"

describe("Wimp", () => {
  test("создание Wimp из WimpInit", () => {
    const wimp = new Wimp({ src: "zavx0z/git", parent: null })

    expect(wimp.src, "Wimp должен хранить src адрес").toBe("zavx0z/git")
    expect(wimp.values, "Wimp без values должен иметь undefined").toBeUndefined()
    expect(wimp.mass, "Wimp без mass должен иметь undefined").toBeUndefined()
    expect(wimp.children, "Wimp по умолчанию должен иметь пустой children set").toEqual(new Set())
    expect(wimp.parent, "Wimp по умолчанию должен иметь явный null parent").toBeNull()
  })

  test("создание Wimp из WimpInit", () => {
    const wimp = new Wimp({
      src: "zavx0z/git-start",
      parent: null,
      values: { operation: null, args: null },
    })

    expect(wimp.src, "Wimp должен хранить src адрес").toBe("zavx0z/git-start")
    expect(wimp.values, "Wimp должен хранить values из init").toEqual({ operation: null, args: null })
    expect(wimp.children, "Wimp по умолчанию должен иметь пустой children set").toEqual(new Set())
    expect(wimp.parent, "Wimp из init без parent должен иметь явный null parent").toBeNull()
  })
})
