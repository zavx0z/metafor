import { describe, test, expect } from "bun:test"
import { MetaFor } from "../../../web/metafor"
import { messagesFixture } from "../../../fixture/message"

describe("работа со статическими тегами с передачей контекста", async () => {
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
    .core({
      child: childHash,
    })
    .processes()
    .reactions((reaction) => [
      [
        ["idle"],
        reaction()
          .filter({
            meta: childHash,
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
      render: ({ context, html, core }) => html`
        <div>
          <h1>Родитель: ${context.parentMessage}</h1>
          <meta-${core.child} context=${{ message: context.parentMessage, count: context.parentCount }} />
        </div>
      `,
    })

  const { waitForMessages } = messagesFixture({ meta: parentTag })
  const container = document.createElement(`meta-${parentTag}`)
  document.body.appendChild(container)

  const childMessages = await waitForMessages(500)

  test("статический тег работает корректно - контекст передается", () => {
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

  test("статический тег работает корректно - нет лишних патчей", () => {
    expect(childMessages, "патч обновления контекста ребенка не должен быть").toHaveLength(1)
    expect(childMessages[0]!.patches[0]!.op, "патч обновления контекста ребенка должен быть add").toEqual("add")
  })

  test("статический тег работает корректно - ребенок рендерится один раз", () => {
    expect(countChildMount, "ребенок должен быть отрендерен 1 раз").toEqual(1)
  })

  test("статический тег работает корректно - родитель рендерится один раз", () => {
    expect(countParentMount, "родитель должен быть отрендерен 1 раз").toEqual(1)
  })
})
