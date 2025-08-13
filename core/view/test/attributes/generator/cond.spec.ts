import { describe, it } from "bun:test"
import { generate, type GenerateParams } from "../../../../../script/test.generator"

describe.each([
  { label: "корневой", path: null },
  { label: "вложенный", path: "nested" },
])("DOM уровень", (domLevel) => {
  describe.each([
    { label: "в массиве", path: "array" },
    { label: "не в массиве", path: null },
  ])("в массиве", (inArray) => {
    const depthCases: { label: string; path: string | null }[] = inArray.path
      ? [
          { label: "вложенность: одна", path: "d1" },
          { label: "вложенность: две", path: "d2" },
        ]
      : [{ label: "вложенность: нет", path: null }]
    describe.each(depthCases)("вложенность массива", (depth) => {
      describe.each([
        { label: "семантика: presence", path: "presence" },
        { label: "семантика: scalar", path: "scalar" },
      ])("семантика", (semantic) => {
        describe.each([
          { label: "в условии", path: "cond" },
          { label: "не в условии", path: null },
        ])("в условии", (condition) => {
          describe.each([
            { label: "тип: по источнику", path: "by-source" },
            { label: "тип: по выражению", path: "by-expr" },
          ])("тип условия", (condType) => {
            describe.each([
              { label: "оператор: ?:", path: "ternary" },
              { label: "оператор: &&", path: "and" },
            ])("оператор", (operator) => {
              describe.each([
                { label: "отрицание: да", path: "not" },
                { label: "отрицание: нет", path: null },
              ])("отрицание", (negation) => {
                describe.each([
                  { label: "значение атрибута: одиночный", path: "single" },
                  { label: "значение атрибута: список", path: "list" },
                ])("значение атрибута", (type) => {
                  it("generate", async () => {
                    await generate({
                      mode: "create",
                      path: "../conditions",
                      params: [domLevel, inArray, depth, semantic, condition, condType, operator, negation, type],
                      template: ({ label, generateRelativePath }) => template({ label, generateRelativePath }),
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })
})

const template = ({ label, generateRelativePath }: GenerateParams) => `import { describe, it, expect } from "bun:test"
import { View } from "${generateRelativePath("core/view")}"
import { Context } from "${generateRelativePath("core/context")}"
const html = String.raw

describe.todo("${label}", () => {
  const container = document.createElement("div")

  const { context, schema, update } = new Context((t) => ({
    string: t.string.required(""),
    number: t.number.required(0),
    boolean: t.boolean.required(false),
    numberArray: t.array.required([0, 1, 2]),
    stringArray: t.array.required(["a", "b", "c"]),
    numberEnum: t.enum(0, 1, 2).required(0),
    stringEnum: t.enum("a", "b", "c").required("a"),
  }))
  const core = {} as const
  const state = "initial" as const

  const view = new View<typeof schema, typeof core, typeof state>({
    render: ({ html, core, context, state }) => html\`
      <div></div>
    \`,
  })

  it.todo("парсер", () => {
    const testedSchema = view.schema

    expect(testedSchema).toBe([])
  })

  it.todo("рендер", () => {
    view.render({ container, core, context, state })

    expect(container.innerHTML).toMatchStringHTML(html\`
      <div></div>
    \`)
  })

  it.todo("обновление", () => {
    update({})

    expect(container.innerHTML).toMatchStringHTML(html\`
      <div></div>
    \`)
  })


  it.todo("перемещение", () => {


    expect(container.innerHTML).toMatchStringHTML(html\`

    \`)  
  })
  
  it.todo("уничтожение", () => {


    expect(container.innerHTML).toMatchStringHTML(html\`

    \`)
  })
})

`
