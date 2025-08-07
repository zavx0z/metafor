import { describe, test, expect } from "bun:test"
import { MetaFor } from "../../../web/metafor"

describe("работа со статическими тегами без передачи контекста", async () => {
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
    .reactions()
    .view({
      onMount: () => {
        countParentMount++
      },
      render: ({ context, html }) => html`
      <div>
        <h1>Родитель: ${context.parentMessage}</h1>
        <meta-${childHash}></meta-${childHash}>
      </div>
    `,
    })

  const container = document.createElement(`meta-${parentTag}`)
  document.body.appendChild(container)
  await Bun.sleep(500)

  test("статический тег работает корректно - ребенок рендерится один раз", () => {
    expect(countChildMount, "ребенок должен быть отрендерен 1 раз").toEqual(1)
  })

  test("статический тег работает корректно - родитель рендерится один раз", () => {
    expect(countParentMount, "родитель должен быть отрендерен 1 раз").toEqual(1)
  })
})
