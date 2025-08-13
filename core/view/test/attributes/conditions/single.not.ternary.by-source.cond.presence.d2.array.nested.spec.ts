import { describe, it, expect } from "bun:test"
import { View } from "../../../index"
import { Context } from "../../../../context/index"
const html = String.raw

describe.todo("вложенный > в массиве > вложенность: две > семантика: presence > в условии > тип: по источнику > оператор: ?: > отрицание: да > значение атрибута: одиночный", () => {
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
    render: ({ html, core, context, state }) => html`
      <div></div>
    `,
  })

  it.todo("парсер", () => {
    const testedSchema = view.schema

    expect(testedSchema).toBe([])
  })

  it.todo("рендер", () => {
    view.render({ container, core, context, state })

    expect(container.innerHTML).toMatchStringHTML(html`
      <div></div>
    `)
  })

  it.todo("обновление", () => {
    update({})

    expect(container.innerHTML).toMatchStringHTML(html`
      <div></div>
    `)
  })


  it.todo("перемещение", () => {


    expect(container.innerHTML).toMatchStringHTML(html`

    `)  
  })
  
  it.todo("уничтожение", () => {


    expect(container.innerHTML).toMatchStringHTML(html`

    `)
  })
})

