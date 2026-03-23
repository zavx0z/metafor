import { describe, expect, test } from "bun:test"
import { Field, materializeFields, readFieldValues, Wimp } from "@dark/strong"

describe("Wimp", () => {
  test("создаётся из `WimpInit`", () => {
    const wimp = new Wimp({ src: "zavx0z/git", parent: null })

    expect(wimp.src, "Wimp должен хранить `src`-адрес").toBe("zavx0z/git")
    expect(wimp.name, "Wimp без локальных данных AST не должен иметь `name`").toBeUndefined()
    expect(wimp.fields, "Wimp без локальных ORM-полей не должен иметь `fields`").toBeUndefined()
    expect(wimp.superposition, "Wimp без локальных данных AST не должен иметь `superposition`").toBeUndefined()
    expect(wimp.processes, "Wimp без локальных данных AST не должен иметь `processes`").toBeUndefined()
    expect(wimp.reactions, "Wimp без локальных данных AST не должен иметь `reactions`").toBeUndefined()
    expect(wimp.bulk, "Wimp без локальных данных AST не должен иметь `bulk`").toBeUndefined()
    expect(wimp.mass, "Wimp без `mass` должен иметь `undefined`").toBeUndefined()
    expect(wimp.children, "Wimp по умолчанию должен иметь пустой набор дочерних частиц").toEqual(new Set())
    expect(wimp.parent, "Wimp по умолчанию должен иметь явный `null` в `parent`").toBeNull()
  })

  test("Wimp хранит локальные объектные поля `Field`", () => {
    const wimp = new Wimp({
      src: "zavx0z/git-start",
      parent: null,
      name: "git-start",
      superposition: {},
      processes: {},
    })

    wimp.fields = materializeFields(wimp, {
      operation: {
        type: "enum<string>",
        values: ["clone", "init"],
      },
      args: {
        type: "string",
      },
    })

    expect(wimp.src, "Wimp должен хранить `src`-адрес").toBe("zavx0z/git-start")
    expect(wimp.name, "Wimp должен хранить локальное имя меты").toBe("git-start")
    expect(wimp.fields?.operation, "Wimp должен собирать объектный `Field`").toBeInstanceOf(Field)
    expect(wimp.fields?.operation.owner, "Field должен знать своего владельца").toBe(wimp)
    expect(wimp.fields?.operation.schema, "Field должен хранить схему поля").toEqual({
      type: "enum<string>",
      values: ["clone", "init"],
    })
    expect(wimp.fields?.operation.value, "Field должен хранить текущее значение").toBeNull()
    expect(wimp.fields?.operation.source, "локальное поле без связи с родителем должно иметь `source = null`").toBeNull()
    expect(readFieldValues(wimp.fields), "Wimp должен читать текущие значения из своих объектных полей").toEqual({
      operation: null,
      args: null,
    })
    expect(wimp.superposition, "Wimp должен хранить локальную `superposition`").toEqual({})
    expect(wimp.processes, "Wimp должен хранить локальные `processes`").toEqual({})
    expect(wimp.children, "Wimp по умолчанию должен иметь пустой набор дочерних частиц").toEqual(new Set())
    expect(wimp.parent, "Wimp из `init` без `parent` должен иметь явный `null`").toBeNull()
  })
})
