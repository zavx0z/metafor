import { describe, test, expect } from "bun:test"
import { MetaFor } from "../../../web/metafor"
import { messagesFixture } from "../../../fixture/message"

describe("работа со статическими тегами с передачей core", async () => {
  let childCore: any
  let countChildMount = 0
  let countParentMount = 0

  const childHash = MetaFor(Bun.randomUUIDv7(), { dev: false })
    .context((types) => ({
      message: types.string.required("child message"),
    }))
    .states({
      idle: {},
    })
    .core(() => ({
      apiService: null as any,
      formRef: null as any,
    }))
    .processes()
    .reactions()
    .view({
      onMount: ({ core }) => {
        countChildMount++
        childCore = core
      },
      render: ({ context, core, html }) => html`
        <div>
          <p>Сообщение: ${context.message}</p>
          <form>
            <input type="text" />
          </form>
        </div>
      `,
    })

  const parentTag = MetaFor(Bun.randomUUIDv7(), { dev: false })
    .context((types) => ({
      parentMessage: types.string.required("message"),
    }))
    .states({
      idle: {},
    })
    .core(() => ({
      apiService: { fetch: () => Promise.resolve({ json: () => ({ data: "test" }) }) },
      parentFormRef: null,
      childHash,
    }))
    .processes()
    .reactions()
    .view({
      onMount: () => {
        countParentMount++
      },
      render: ({ context, core, html }) => html`
        <div>
          <h1>Родитель: ${context.parentMessage}</h1>
          <meta-${core.childHash} core=${{ apiService: core.apiService }} />
        </div>
      `,
    })

  const { waitForMessages } = messagesFixture({ meta: parentTag })
  const container = document.createElement(`meta-${parentTag}`)
  document.body.appendChild(container)

  const childMessages = await waitForMessages(500)

  test("статический тег работает корректно - core передается", () => {
    expect(childCore, "core ребенка должен быть доступен").toBeDefined()
    expect(childCore.apiService, "apiService должен быть передан от родителя").toBeDefined()
    expect(typeof childCore.apiService.fetch, "apiService должен иметь метод fetch").toBe("function")
  })

  test("статический тег работает корректно - нет лишних патчей", () => {
    expect(childMessages, "патч обновления core ребенка не должен быть").toHaveLength(1)
    expect(childMessages[0]!.patches[0]!.op, "патч обновления core ребенка должен быть add").toEqual("add")
  })

  test("статический тег работает корректно - ребенок рендерится один раз", () => {
    expect(countChildMount, "ребенок должен быть отрендерен 1 раз").toEqual(1)
  })

  test("статический тег работает корректно - родитель рендерится один раз", () => {
    expect(countParentMount, "родитель должен быть отрендерен 1 раз").toEqual(1)
  })

  test("статический тег работает корректно - core объекты передаются корректно", () => {
    expect(childCore.formRef, "formRef должен быть доступен").toBeDefined()
    expect(childCore.apiService, "apiService должен быть передан от родителя").toBeDefined()
    expect(typeof childCore.apiService.fetch, "apiService должен иметь метод fetch").toBe("function")
  })
})
