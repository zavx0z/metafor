import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {createGraphFixture} from "../../fixtures/graph.fixture.js"

const fixture = createGraphFixture()

beforeAll(async () => {
  await fixture.setup()
})

afterAll(async () => {
  await fixture.teardown()
})

describe("Граф атома", () => {
  test("Должен отобразить граф для простого атома", async () => {
    const atomName = "test-atom"
    const atomId = await fixture.page.evaluate(async () => {
      const atom = window.Atom("подключение")
        .states("ПОДКЛЮЧАЕТСЯ", "ОТКРЫТ", "ЗАКРЫТ", "ОЖИДАЕТ")
        .context({
          status: window.t.string({title: "Статус", nullable: true}),
          progress: window.t.number({title: "Прогресс", nullable: true})
        })
        .collapses([
          {
            from: "ПОДКЛЮЧАЕТСЯ",
            to: [{
              state: "ОТКРЫТ",
              trigger: {
                status: "processing",
                progress: {gt: 0}
              }
            }]
          },
          {
            from: "ОТКРЫТ",
            to: [{
              state: "ЗАКРЫТ",
              trigger: {
                progress: {gte: 100}
              }
            }]
          }
        ]).core().actions({})
        .create({
          state: "ПОДКЛЮЧАЕТСЯ",
          graph: true
        })
      const component = await atom.graph()

      return component.id
    }, atomName)
    // Проверяем наличие узлов графа
    expect(atomId).toEqual(`/${atomName}`)
  })
}) 