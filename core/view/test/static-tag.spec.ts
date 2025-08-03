import { describe, test, expect } from "bun:test"
import { MetaFor } from "../../../web/metafor.ts"
import { messagesFixture } from "../../../fixture/message.ts"
import { createStaticViewFunction } from "../index"

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

  // Создаем статическую view функцию для родителя
  const originalParentView = ({ context, html }: any) => html`
    <div>
      <h1>Родитель: ${context.parentMessage}</h1>
      <meta-${childHash}
        context=${{
          message: context.parentMessage,
          count: context.parentCount,
        }}></meta-${childHash}>
    </div>
  `

  const staticParentView = createStaticViewFunction(originalParentView, childHash)

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
      render: staticParentView,
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

  test("статическая view функция создается корректно", () => {
    expect(staticParentView, "функция должна быть создана").toBeInstanceOf(Function)

    // Проверяем, что функция работает
    const mockContext = { parentMessage: "test", parentCount: 5 }
    const mockHtml = (strings: any, ...values: any[]) => ({ strings, values })

    const result = staticParentView({
      context: mockContext,
      html: mockHtml,
    })

    // Проверяем, что в результате нет динамических тегов
    const templateString = result.strings.join("")
    expect(templateString, "шаблон не должен содержать динамические теги").not.toContain("${childHash}")
    expect(templateString, "шаблон должен содержать статический тег").toContain(`meta-${childHash}`)
  })
})
