import { describe, expect, test } from "bun:test"
import { Wimp } from "@dark/strong"

describe("Wimp", () => {
  test("создание Wimp из WimpInit", () => {
    const wimp = new Wimp({ src: "zavx0z/git", parent: null })

    expect(wimp.src, "Wimp должен хранить src адрес").toBe("zavx0z/git")
    expect(wimp.name, "Wimp без локальных AST-данных не должен иметь name").toBeUndefined()
    expect(wimp.fields, "Wimp без локальных AST-данных не должен иметь fields").toBeUndefined()
    expect(wimp.superposition, "Wimp без локальных AST-данных не должен иметь superposition").toBeUndefined()
    expect(wimp.processes, "Wimp без локальных AST-данных не должен иметь processes").toBeUndefined()
    expect(wimp.reactions, "Wimp без локальных AST-данных не должен иметь reactions").toBeUndefined()
    expect(wimp.bulk, "Wimp без локальных AST-данных не должен иметь bulk").toBeUndefined()
    expect(wimp.values, "Wimp без values должен иметь undefined").toBeUndefined()
    expect(wimp.mass, "Wimp без mass должен иметь undefined").toBeUndefined()
    expect(wimp.children, "Wimp по умолчанию должен иметь пустой children set").toEqual(new Set())
    expect(wimp.parent, "Wimp по умолчанию должен иметь явный null parent").toBeNull()
  })

  test("создание Wimp из WimpInit", () => {
    const wimp = new Wimp({
      src: "zavx0z/git-start",
      parent: null,
      name: "git-start",
      fields: {
        operation: {
          type: "enum<string>",
          values: ["clone", "init"],
        },
      },
      superposition: {},
      processes: {},
      values: { operation: null, args: null },
    })

    expect(wimp.src, "Wimp должен хранить src адрес").toBe("zavx0z/git-start")
    expect(wimp.name, "Wimp должен хранить локальное имя meta").toBe("git-start")
    expect(wimp.fields, "Wimp должен хранить локальную схему fields").toEqual({
      operation: {
        type: "enum<string>",
        values: ["clone", "init"],
      },
    })
    expect(wimp.superposition, "Wimp должен хранить локальную superposition").toEqual({})
    expect(wimp.processes, "Wimp должен хранить локальные processes").toEqual({})
    expect(wimp.values, "Wimp должен хранить values из init").toEqual({ operation: null, args: null })
    expect(wimp.children, "Wimp по умолчанию должен иметь пустой children set").toEqual(new Set())
    expect(wimp.parent, "Wimp из init без parent должен иметь явный null parent").toBeNull()
  })
})
