import {createGraphFixture} from "../../fixtures/graph.fixture.js"
import {afterAll, beforeAll, describe, expect, it} from "bun:test"

describe("Socket", () => {
  const fixture = createGraphFixture({
    headless: false,
    devtools: true
  })

  beforeAll(async () => {
    await fixture.setup()

    // Создаем атом один раз и сохраняем в dataStore
    await fixture.page.evaluate(() => {
      const atom = window
        .Atom("TestAtom")
        .states("INITIAL")
        .context({
          test: window.t.string({title: "Тест"})
        })
        .collapses([])
        .core()
        .actions({})
        .create({
          state: "INITIAL",
          graph: true
        })
      window.dataStore.set("socket_test_atom", atom)
      return atom.graph()
    })
  })

  afterAll(async () => {
    await fixture.teardown()
  })

  it("должен отображать список действий при наведении на output сокет", async () => {
    // Получаем атом из dataStore
    const socket = await fixture.page.waitForSelector('graph-socket[id*="output"]')
    await socket!.hover()

    const actionsList = await fixture.page.waitForSelector(".socket-actions-list")
    expect(actionsList).toBeTruthy()

    const items = await fixture.page.$$(".socket-action-item")
    expect(items).toHaveLength(3)

    const itemsText = await Promise.all(items.map(item => fixture.page.evaluate(el => el.textContent, item)))
    expect(itemsText).toEqual(["Создать связь", "Копировать ID", "Отладка"])
  })

  it("не должен отображать список действий для input сокета", async () => {
    const socket = await fixture.page.waitForSelector('graph-socket[id*="input"]')
    await socket!.hover()

    const actionsList = await fixture.page.$(".socket-actions-list")
    expect(actionsList).toBeNull()
  })

  it("должен скрывать список действий при уходе мыши", async () => {
    const socket = await fixture.page.waitForSelector('graph-socket[id*="output"]')
    await socket!.hover()

    const actionsList = await fixture.page.waitForSelector(".socket-actions-list")
    expect(actionsList).toBeTruthy()

    await fixture.page.mouse.move(0, 0)

    const actionsListAfter = await fixture.page.$(".socket-actions-list")
    expect(actionsListAfter).toBeNull()
  })

  it("должен копировать ID сокета в буфер обмена", async () => {
    const socket = await fixture.page.waitForSelector('graph-socket[id*="output"]')
    const socketId = await socket!.evaluate(el => el.id)

    await socket!.hover()

    // Сначала найдем все элементы действий
    const items = await fixture.page.$$(".socket-action-item")
    // Проверим текст всех элементов
    const itemsText = await Promise.all(items.map(item => fixture.page.evaluate(el => el.textContent, item)))
    console.log("Доступные действия:", itemsText)

    // Находим второй элемент (Копировать ID)
    const copyItem = items[1]
    await copyItem?.click()

    // Добавляем задержку для обработки буфера обмена
    await new Promise(resolve => setTimeout(resolve, 100))

    const clipboardContent = await fixture.page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardContent).toBe(socketId)
  })
})
