import { describe, test, expect } from "bun:test"
import { MetaFor } from "../../metafor"
import { messagesFixture } from "../../fixture/message"

describe("обновление контекста ребенка", async () => {
  document.body.innerHTML = `<metafor-parent-2432222></metafor-parent-2432222>`

  const { waitForMessages } = messagesFixture({ meta: "child-2431231" })

  let childInitContext: any
  let childUpdateContext: any
  let countChildMount = 0
  MetaFor("child-2431231")
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

  MetaFor("parent-2432222")
    .context((types) => ({
      parentMessage: types.string.required("message"),
      parentCount: types.number.required(0),
    }))
    .states({
      idle: {},
    })
    .core()
    .processes((process) => ({
      idle: process()
        .action(async () => {
          await Bun.sleep(100)
          return { parentMessage: "updated message", parentCount: 1 }
        })
        .success(({ update, data }) => update({ parentMessage: data.parentMessage, parentCount: data.parentCount })),
    }))
    .reactions((reaction) => [
      [
        ["idle"],
        reaction()
          .filter({
            op: "add",
          })
          .equal(({ patch }) => {
            childInitContext = patch.value.context
          }),
      ],
      [
        ["idle"],
        reaction()
          .filter({
            op: "replace",
            path: "/context",
          })
          .equal(({ patch }) => {
            childUpdateContext = patch.value
          }),
      ],
    ])
    .view({
      render: ({ context, html }) => html`
        <div>
          <h1>Родитель: ${context.parentMessage}</h1>
          <metafor-child-2431231
            context=${{
              message: context.parentMessage,
              count: context.parentCount,
            }}></metafor-child-2431231>
        </div>
      `,
    })

  const childMessages = await waitForMessages(400)
  // console.log(childMessages)

  test("в реакции родителя при добавлении ребенка получаем переданный контекст", async () => {
    expect(
      childInitContext,
      "контекст ребенка должен соответствовать переданному от родителя при инициализации"
    ).toEqual({
      message: "message",
      count: 0,
    })
  })
  test("контекст ребенка должен быть обновлен", async () => {
    expect(childUpdateContext, "контекст ребенка должен быть обновлен").toEqual({
      message: "updated message",
      count: 1,
    })
  })
  test("должно быть сообщения с патчем обновления контекста ребенка", async () => {
    expect(childMessages, "патч обновления контекста ребенка должен быть").toHaveLength(2)
    expect(childMessages[0]!.patch.op, "патч обновления контекста ребенка должен быть add").toEqual("add")
  })
  test("ребенок должен быть отрендерен 1 раз", () => {
    expect(countChildMount, "не должно быть перерендеров").toEqual(1)
  })
})
