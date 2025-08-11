import { describe, test, expect } from "bun:test"
import { MetaFor } from "../../../web/metafor.ts"

describe.skip("обновление контекста ребенка", async () => {
  let childInitContext: any
  let childUpdateContext: any
  let countChildMount = 0

  const childTag = MetaFor(Bun.randomUUIDv7())
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

  const parentTag = MetaFor(Bun.randomUUIDv7())
    .context((types) => ({
      parentMessage: types.string.required("message"),
      parentCount: types.number.required(0),
    }))
    .states({
      idle: {},
    })
    .core({
      child: childTag,
    })
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
      render: ({ context, html, core }) => html`
        <div>
          <h1>Родитель: ${context.parentMessage}</h1>
          <meta-${core.child}
            context=${{
              message: context.parentMessage,
              count: context.parentCount,
            }} />
        </div>
      `,
    })
  document.body.innerHTML = `<meta-${parentTag}></meta-${parentTag}>`
  await Bun.sleep(200)
  test("в реакции родителя при добавлении ребенка получаем переданный контекст", () => {
    expect(
      childInitContext,
      "контекст ребенка должен соответствовать переданному от родителя при инициализации"
    ).toEqual({
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
  // test("контекст ребенка должен быть обновлен", () => {
  //   expect(childUpdateContext, "контекст ребенка должен быть обновлен").toEqual({
  //     message: "updated message",
  //     count: 1,
  //   })
  // })
  // test("должно быть сообщения с патчем обновления контекста ребенка", () => {
  //   expect(childMessages, "патч обновления контекста ребенка должен быть").toHaveLength(2)
  //   expect(childMessages[0]!.patch.op, "патч обновления контекста ребенка должен быть add").toEqual("add")
  // })
  test("ребенок должен быть отрендерен 1 раз", () => {
    expect(countChildMount, "не должно быть перерендеров").toEqual(1)
  })
})
