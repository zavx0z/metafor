import { describe, beforeAll, test, expect } from "bun:test"
import { createStaticViewFunction, View } from "../index"
import { MetaFor } from "../../../web/metafor"
import { messagesFixture } from "../../../fixture/message"
import { Context } from "../../context"
import { html } from "../../html"

describe("  ", () => {
  const { context } = new Context((types) => ({
    parentMessage: types.string.required("message"),
    parentCount: types.number.required(0),
  }))
  const core = {}
  const state = "idle"

  const hash = "child-243232"
  test("соответствие шаблонов", () => {
    const template1 = html`<div>
      <h1>Родитель: ${context.parentMessage}</h1>
      <meta-${hash}
        context=${{
          message: context.parentMessage,
          count: context.parentCount,
        }}></meta-${hash}>
    </div>`
    
    const template2 = html`<div>
      <h1>Родитель: ${context.parentMessage}</h1>
      <meta-child-243232
        context=${{
          message: context.parentMessage,
          count: context.parentCount,
        }}></meta-child-243232>
    </div>`
    
    // Проверяем, что строки обработаны корректно
    expect(template1.strings[2]).toContain("meta-child-243232")
    expect(template1.values).toHaveLength(2) // Одно значение встроено в строку
  })
})
describe("работа со статическими тегами", async () => {
  let childContext: any
  let countChildMount = 0
  let countParentMount = 0

  const childHash = MetaFor(Bun.randomUUIDv7(), { dev: false })
    .context((types) => ({
      message: types.string.required("child message"),
      count: types.number.required(1),
    }))
    .states({
      idle: {},
    })
    .core()
    .processes()
    .reactions()
    .view({
      onMount: () => {
        countChildMount++
      },
      render: ({ context, html }) => html`
        <div>
          <p>Сообщение: ${context.message}</p>
          <p>Счетчик: ${context.count}</p>
        </div>
      `,
    })

  const parentTag = MetaFor(Bun.randomUUIDv7(), { dev: false })
    .context((types) => ({
      parentMessage: types.string.required("message"),
      parentCount: types.number.required(0),
    }))
    .states({
      idle: {},
    })
    .core()
    .processes()
    .reactions((reaction) => [
      [
        ["idle"],
        reaction()
          .filter({
            op: "add",
          })
          .equal(({ patch }) => {
            childContext = patch.value.context
          }),
      ],
    ])
    .view({
      onMount: () => {
        countParentMount++
      },
      render: ({ context, html }) => html`
      <div>
        <h1>Родитель: ${context.parentMessage}</h1>
        <meta-${childHash}
          context=${{
            message: context.parentMessage,
            count: context.parentCount,
          }}></meta-${childHash}>
      </div>
    `,
    })
  const { waitForMessages } = messagesFixture({ meta: parentTag })

  document.body.innerHTML = `<meta-${parentTag}></meta-${parentTag}>`

  const childMessages = await waitForMessages(500)

  test("статический тег работает корректно - контекст передается", async () => {
    expect(childContext, "контекст ребенка должен соответствовать переданному от родителя").toEqual({
      count: {
        default: 1,
        required: true,
        type: "number",
        value: 0,
      },
      message: {
        default: "child message",
        required: true,
        type: "string",
        value: "message",
      },
    })
  })
  test("статический тег работает корректно - нет лишних патчей", async () => {
    expect(childMessages, "патч обновления контекста ребенка не должен быть").toHaveLength(1)
    expect(childMessages[0]!.patch.op, "патч обновления контекста ребенка должен быть add").toEqual("add")
  })

  test("статический тег работает корректно - ребенок рендерится один раз", () => {
    expect(countChildMount, "ребенок должен быть отрендерен 1 раз").toEqual(1)
  })

  test("статический тег работает корректно - родитель рендерится один раз", () => {
    expect(countParentMount, "родитель должен быть отрендерен 1 раз").toEqual(1)
  })
})
