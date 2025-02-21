import {describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"

const atom = Atom("Обработчик событий")
  .states("IDLE", "RUNNING", "ERROR", "SUCCESS")
  .context({
    url: t.string({title: "URL", nullable: true}),
    responseTime: t.number({title: "Время ответа", nullable: true}),
    errorCode: t.number({title: "Код ошибки", nullable: true})
  })
  .collapses([
    {
      from: "IDLE",
      to: [{state: "RUNNING", trigger: {url: {startsWith: "https://"}, responseTime: {gt: 0, lt: 5000}}}]
    },
    {
      from: "RUNNING",
      to: [
        {state: "SUCCESS", trigger: {responseTime: {gt: 0, lt: 5000}, errorCode: 200}},
        {state: "ERROR", trigger: {errorCode: {gt: 400, lt: 599}}}
      ]
    },
    {
      from: "ERROR",
      to: [{state: "IDLE", trigger: {url: {startsWith: "https://"}}}]
    },
    {
      from: "SUCCESS",
      to: [{state: "IDLE", trigger: {url: {startsWith: "https://"}}}]
    }
  ])
  .core()
  .actions({})
  .reactions([]).create({
    state: "IDLE",
    context: {
      url: null,
      responseTime: 0,
      errorCode: 0
    }
  })

describe("Подписка на изменения состояния (onCollapse)", () => {
  describe("Базовая работа подписки", () => {
    test("Подписка должна срабатывать при изменении состояния", async () => {
      let oldState = ""
      let newState = ""

      atom.onCollapse((prevState, nextState) => {
        oldState = prevState
        newState = nextState
      })
      atom.update({url: "https://api.example.com", responseTime: 2000, errorCode: 0})

      await Bun.sleep(10)

      expect(oldState).toBe("IDLE")
      expect(newState).toBe("RUNNING")
    })

    test("Подписка не должна срабатыват при переходе в то же состояние", () => {
      let callbackCalled = false

      atom.onCollapse(() => (callbackCalled = true))

      atom.update({url: "https://api.example.com", responseTime: 2000, errorCode: 0})

      expect(callbackCalled).toBe(false)
    })
  })

  describe("Множественные подписки", () => {
    test("Поддержка нескольких подписок", async () => {
      let firstCallbackCalled = false
      let secondCallbackCalled = false

      atom.onCollapse(() => (firstCallbackCalled = true))
      atom.onCollapse(() => (secondCallbackCalled = true))

      atom.update({errorCode: 500})
      await Bun.sleep(10)
      expect(firstCallbackCalled).toBe(true)
      expect(secondCallbackCalled).toBe(true)
    })

    test("Отписка не должна влиять на другие подписки", () => {
      let firstCallbackCalled = false
      let secondCallbackCalled = false

      const unsubscribe = atom.onCollapse(() => (firstCallbackCalled = true))

      atom.onCollapse(() => (secondCallbackCalled = true))

      unsubscribe()

      atom.update({url: "https://api.example.com", responseTime: 3000, errorCode: 0})

      expect(firstCallbackCalled).toBe(false)
      expect(secondCallbackCalled).toBe(true)
    })
  })

  describe("Последовательные изменения", () => {
    test("Корректное отслеживание цепочки изменений состояний", async () => {
      const collapses: { from: string, to: string }[] = []

      atom.onCollapse((prevState, nextState) => collapses.push({from: prevState, to: nextState}))

      // Переход в RUNNING
      atom.update({url: "https://api.example.com", responseTime: 3000, errorCode: 0})
      await Bun.sleep(10)
      // Переход в ERROR
      atom.update({responseTime: 4000, errorCode: 500})
      await Bun.sleep(10)
      // Переход обратно в IDLE
      atom.update({url: "https://api.example.com", responseTime: 1000, errorCode: 0})

      expect(collapses).toEqual([
        {from: "IDLE", to: "RUNNING"},
        {from: "RUNNING", to: "ERROR"},
        {from: "ERROR", to: "IDLE"}
      ])
    })
  })
})
