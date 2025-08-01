import { describe, test, expect } from "bun:test"
import { MetaFor } from "../../../web/metafor.ts"
import { messagesFixture } from "../../../fixture/message.ts"

describe("инициализация ребенка с переданным контекстом от родителя", async () => {
  document.body.innerHTML = `<metafor-parent-243234></metafor-parent-243234>`

  const { waitForMessages } = messagesFixture({ meta: "child-243232" })

  let childContext: any
  let countChildMount = 0
  MetaFor("child-243232")
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

  MetaFor("parent-243234")
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
      render: ({ context, html }) => html`
        <div>
          <h1>Родитель: ${context.parentMessage}</h1>
          <metafor-child-243232
            context=${{
              message: context.parentMessage,
              count: context.parentCount,
            }}></metafor-child-243232>
        </div>
      `,
    })

  const childMessages = await waitForMessages(400)

  test("в реакции родителя при добавлении ребенка получаем переданный контекст", async () => {
    expect(childContext, "контекст ребенка должен соответствовать переданному от родителя").toEqual({
      message: "message",
      count: 0,
    })
  })
  test("не должно быть сообщения с патчем обновления контекста ребенка", async () => {
    expect(childMessages, "патч обновления контекста ребенка не должен быть").toHaveLength(1)
    expect(childMessages[0]!.patch.op, "патч обновления контекста ребенка должен быть add").toEqual("add")
  })
  test("ребенок должен быть отрендерен 1 раз", () => {
    expect(countChildMount, "ребенок должен быть отрендерен 1 раз").toEqual(1)
  })
})
